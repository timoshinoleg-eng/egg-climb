# Daily Tower leaderboard — contract foundation

Status: contract foundation for ADR 0001 step 7. This PR does not deploy a
backend, provision a database, or implement the procedural Kitchen/Daily
generator.

## Implemented in this PR

- Replay protocol v4 extends the existing replay identity with only the
  Daily-specific evidence that was missing: `levelFormatVersion`, canonical
  `levelHash`, `generatorVersion`, and `rulesetHash`. Existing simulation,
  Rapier, physics/egg/feel, tick-rate, level id/version, seed, controls and
  assist identity remain in the same `ReplayHeader`.
- `LevelDefinition` is a minimal versioned canonical storage shape for the
  geometry the current simulation already supports. No Kitchen schema is
  guessed here.
- `runReplay()` derives historical max-height telemetry inside the
  authoritative tick loop and structural replay limits are checked before
  Rapier is constructed.
- MAX `WebAppData` parsing is fail-closed for malformed percent encoding,
  malformed pairs, duplicate outer parameters and duplicate signed inner
  keys. Signed `user.id` is preserved as a decimal string to avoid int64
  precision loss.
- Canonical JSON + SHA-256 helpers define canonical level and replay evidence
  hashes. Client fingerprint telemetry is excluded from replay content
  identity.
- PostgreSQL schema stores immutable Daily identity, fixed-point score fields,
  canonical replay text, and a deterministic leaderboard view.

## Canonical Daily identity

A Daily is selected by one **UTC calendar date** and published once. The
storage identity is:

```
tower_date
level_id + level_version
seed                       # provenance/debug only
generator_version
level_format_version
level_hash                 # SHA-256(canonical_level)
ruleset_hash
canonical_level            # exact canonical LevelDefinition text
```

`seed` is not source of truth. The exact canonical level text is. Publication
must use insert-once semantics: if a row already exists for a UTC date, read
and reuse it. `daily_towers` rejects UPDATE and DELETE so a published date
cannot silently regenerate under another generator or level definition.

Canonical JSON sorts object keys lexicographically, preserves array order,
rejects sparse/non-JSON values, and uses ECMAScript JSON number rendering.
`FOUNDATION_LEVEL_HASH` is tested against the committed canonical Foundation
`LevelDefinition`. The Daily ruleset hash is tested the same way.

## Canonical score v1

The level origin is `LevelDefinition.origin`. After **every completed
authoritative simulation tick**, replay validation derives the egg world-space
center-of-mass Y from the authoritative rigid-body pose and pinned physics COM
offset. It subtracts `origin.y`, converts that sample to integer millimetres,
and updates the historical score.

Conversion is deterministic:

```
scaled = meters * 1000
positive: floor(scaled + 0.5)
negative: -floor(-scaled + 0.5)
```

Thus exact half-millimetre ties round away from zero. Historical comparisons
are made **after** quantization. `max_height_mm` is the largest sampled integer
and `first_tick_at_max_height` is the earliest completed tick that produced
that integer. Equal later samples never replace the first tick. Render rate,
presentation events and client-supplied score fields are irrelevant.

A zero-tick replay has no completed-tick sample, so `runReplay()` returns
`maxHeightMm = null` and `firstTickAtMaxHeight = null`. It is valid replay data
but is not an acceptable leaderboard attempt; persisted attempts require at
least one tick.

The Foundation level still has no authoritative finish semantic. Therefore
`runReplay()` returns `completed = false` and `completionTick = null`; this PR
does not invent a finish heuristic. The schema is ready for a future explicit
Finish contract.

## Ranking semantics

Mixed leaderboard ordering is:

1. completed runs before all incomplete runs;
2. completed: `completion_tick ASC`, then `run_id ASC`;
3. incomplete: `max_height_mm DESC`, then
   `first_tick_at_max_height ASC`, then `run_id ASC`.

The SQL view first selects the best accepted run per player per Daily using
that exact order, then assigns global rank for that Daily using the same order.
Replay end tick is never a surrogate for first tick at max height.

## Replay resource admission

Core validation currently enforces, before simulation construction:

- `finishTick <= 18_000` (5 minutes at 60 Hz);
- `inputEvents.length <= 10_000`;
- at most 32 canonical input events at one tick;
- all existing fail-closed replay compatibility and canonical event rules.

These are reusable `ReplayLimits`; boundary and rejection cases are tested.
The future HTTP layer additionally needs a request-body byte limit **before
JSON parsing** and rate limiting before replay execution.

A synchronous `Promise.race([runReplay(), timeout])` is explicitly **not** a
security timeout: it cannot interrupt CPU-bound Rapier work in the same JS
isolate. Production replay acceptance requires a killable boundary such as a
Worker Thread, child process or equivalent isolate that the request runtime can
actually terminate. That remains a launch blocker because this PR contains no
HTTP replay executor.

## MAX initData contract

The validator follows the current official MAX Mini Apps validation algorithm
(`https://dev.max.ru/docs/webapps/validation`): decode signed values, exclude
`hash`, sort keys, join `key=value` lines with `\n`, derive
`HMAC-SHA256(key="WebAppData", data=BOT_TOKEN)`, then HMAC the data-check
string with that secret and compare lowercase hex in constant time.

Parser rules are deliberately strict:

- every outer launch-fragment key appears once;
- malformed percent encoding rejects the entire launch fragment;
- every signed inner key appears once (`hash`, `auth_date`, `user`,
  `query_id`, and unknown future keys included);
- malformed signed user JSON rejects rather than becoming an anonymous user;
- `auth_date` defaults to a 900-second freshness/skew window;
- user identity is returned as a decimal string, never a JS Number.

MAX API identity is int64-capable, so lossless string storage avoids precision
loss above `Number.MAX_SAFE_INTEGER`. Raw initData is validated in memory and
must not be persisted or logged. The bot token never belongs in a client
bundle. MAX real `first_name`/username are not public leaderboard identity;
`players.public_display_name` is a separate nullable nickname/egg-name field.

## Replay hash, accepted-attempt uniqueness, HTTP idempotency

These are three separate concepts:

1. `replay_sha256` is SHA-256 of canonical authoritative replay evidence:
   header + canonical input events + finish tick. `clientFingerprint` is
   excluded because it is untrusted telemetry.
2. DB uniqueness is `(player_id, daily_tower_id, replay_sha256)`. It prevents
   duplicate accepted attempts for one player/day while allowing two players
   to submit identical deterministic input.
3. HTTP idempotency is a transport concern for the future endpoint. If an
   idempotency key is added, it is separate from the replay content hash.

The exact canonical replay text corresponding to the hash is stored as text;
PostgreSQL `jsonb` normalization is not used as the hash representation.

## Future submit flow

The future endpoint must preserve this order:

```
request
→ body-size guard before JSON parse
→ strict MAX initData validation
→ per-user/IP rate limit
→ cheap assertReplay structural/compatibility validation
→ load canonical Daily and match replay level/generator/ruleset identity
→ killable replay execution boundary
→ server-derived score + fingerprint
→ transactional/idempotent persistence
→ leaderboard result
```

Claimed client height/completion/rank is never accepted as evidence. A client
fingerprint mismatch remains nondeterminism telemetry under ADR 0002, not proof
of cheating.

## Remaining launch blockers (outside this PR)

- Explicit Finish/goal semantic in the authoritative level/simulation contract.
- Procedural Daily generator + atomic UTC publication using canonical
  `LevelDefinition`; Kitchen content remains a separate stage.
- HTTP `/api/runs` and leaderboard read endpoint.
- Pre-parse body-size enforcement and production rate limiting.
- Killable replay execution worker/process/isolate with enforced wall-clock
  termination; no fake same-isolate Promise timeout.
- Transactional persistence/idempotency handling and DB provisioning/secrets.
- Real MAX launch integration and a real-device/WKWebView smoke test before
  public release.

No Neon/Supabase/Vercel resource is created or selected as a required provider
by this contract PR.
