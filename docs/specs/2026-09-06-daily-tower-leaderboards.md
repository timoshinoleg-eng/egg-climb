# Daily Tower leaderboards — schema and acceptance flow

Status: groundwork (2026-09-06). Implements the storage and acceptance
half of ADR 0001 step 7 ("Daily Tower, server replay validation and
leaderboard acceptance rules"). The procedural Daily Tower generator
itself is a separate sim PR.

## Decision: Neon + Node validation endpoint

Score acceptance must re-run the submitted replay through the deterministic
simulation (`runReplay` from `dist/sim`). That needs a Node runtime with
the repo's pinned npm packages (`@dimforge/rapier3d-deterministic-compat`).

- **Neon** (serverless Postgres, eu-central) pairs with Vercel Functions
  running Node — the replay validator ships the same `dist/sim` build the
  tests already run. Recommended.
- Supabase is a viable fallback (the SQL here is compatible), but its Edge
  Functions run Deno, where the Rapier WASM compat build is unverified —
  an avoidable risk for the acceptance-critical path.

## Submit flow

1. Mini App launches in MAX; the client reads `WebAppData` from the URL
   fragment (see `src/server/max-initdata.ts`; the outer parser is
   fail-closed on duplicated launch parameters).
2. On run finish, the client POSTs `{ initData, replay, clientPlatform }`
   to `/api/runs`. Claimed scores are never trusted.
3. Server validates `initData` (HMAC-SHA256 + auth_date freshness),
   identifies the player (`user.id`), upserts `players`.
4. Server re-runs `replay` via `runReplay` — but only after the fail-fast
   resource limits below pass. Rejection reasons from the replay contract
   (protocol/sim/Rapier/preset/level mismatch, non-canonical events) map
   to HTTP 422.
5. Server derives the result from its own run: fingerprint and height.
   Note: the current replay API returns the final snapshot only; tracking
   per-tick max height is a small sim addition required before launch.
6. Insert into `runs` (`unique (player_id, tower_date, replay_sha256)` →
   idempotent retries per player per tower). Response:
   `{ accepted: true, rank, bestHeightM }`.

## Fail-fast replay limits (required before /api/runs ships)

`runReplay` today only checks `finishTick >= 0`; an authenticated user
could otherwise submit an enormous replay and keep Rapier busy. Before the
endpoint goes live, enforce (in `src/sim/replay.ts` + the HTTP layer):

- max `finishTick` (e.g. 36 000 ticks = 10 minutes of play)
- max `inputEvents.length` (e.g. 20 000)
- max request body bytes at the edge (e.g. 256 KB) — rejects before parsing
- per-player rate limit evaluated BEFORE any replay execution
- CPU/wall-clock budget around `runReplay` with a hard timeout

These belong to the endpoint PR, but they are launch blockers, so they are
recorded here.

## API contract (draft)

```
POST /api/runs
  body: { initData: string, replay: Replay, clientPlatform?: string }
  200 { accepted: true, rank: number, bestHeightM: number }
  401 { accepted: false, reason: string }   // initData invalid/stale
  422 { accepted: false, reason: string }   // replay rejected

GET /api/leaderboard?date=YYYY-MM-DD&limit=50
  200 { date, entries: [{ rank, displayName, maxHeightM, finishTick }] }
```

## Schema

See `db/migrations/0001_leaderboard.sql` (idempotent, Postgres 15+):

- `players` — one row per MAX user; only `max_user_id` + `display_name`
  are stored. initData is validated in memory and never persisted.
- `daily_towers` — one row per day: `(tower_date, seed, level_version)`.
- `runs` — every accepted attempt with the full replay (`jsonb`), the
  server-computed fingerprint and a per-player-per-tower replay hash for
  idempotency. The hash is deliberately NOT globally unique: deterministic
  replays make identical inputs from different players legal.
- `daily_leaderboard` (view) — best run per player per tower: height desc,
  then fewest ticks.

Apply with: `psql $DATABASE_URL -f db/migrations/0001_leaderboard.sql`.

## Anti-cheat and abuse rules

- The replay is the score: height and fingerprint come from the server
  re-run, never from client fields.
- Replay metadata must pin the current sim/physics/level versions — the
  existing fail-closed contract rejects stale or foreign replays.
- Resource limits above run before the simulator starts.
- Freshness window 900 s on `auth_date` blocks captured-payload reuse.
- Optional hardening later: a separate HTTP idempotency key distinct from
  the replay content hash.

## Retention hooks enabled by this schema

- Daily Tower ladder resets every day — a reason to return tomorrow.
- Stored replays unlock asynchronous «ghosts» of friends' runs later
  (read-only; no schema change needed).
- Share prompt on a new personal best via the MAX deeplink
  `https://max.ru/:share?text=...` (works on iOS/Android/web).

## Follow-ups (not in this PR)

1. Sim: per-tick max-height tracking during `runReplay` + its golden test.
2. Daily Tower generator in `src/sim` (seeded, committed order) + level
   version registration in replay metadata.
3. Vercel Function `/api/runs` wiring `validateMaxInitData` + `runReplay`
   + Neon; secrets via env (`MAX_BOT_TOKEN`, `DATABASE_URL`); replay
   resource limits from this spec.
4. MAX Partner Cabinet: bot publication requires a юрлицо/ИП/самозанятый
   account per platform rules — sort out before the public launch.
