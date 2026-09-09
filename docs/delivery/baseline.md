# Baseline — 2026-09-10

## Checkout and environment (before source changes)

- Repository was already cloned by Arena; no second clone into a non-empty checkout.
- Baseline: `ec520776c2ca186bd10d3959d723670ee7e30856` (main PR #11).
- Session branch: `arena/01a087f3-egg-climb` (required by the workspace).
- Working tree was clean.
- Debian 12 / Linux x64; Node 22.22.3, npm 10.9.8; `.nvmrc` = 22.
- `npm ci`: PASS, 8 packages installed, lockfile unchanged.

| Command | Baseline result |
| --- | --- |
| `npm run build` | PASS, TypeScript 5.9.3 |
| `npm test` | PASS: 95 tests, 0 failed/skipped; deterministic AST policy PASS |
| `npx playwright test` | ENVIRONMENT BLOCKED: all 24 cases failed to launch; no browser executables installed |
| `npm audit --audit-level=high` | PASS: 0 vulnerabilities |

`npx playwright install --with-deps chromium firefox webkit` failed because the
sandbox could not connect to Debian mirrors. A browser-only install also failed
with TLS ECONNRESET to Playwright's download CDN. These are environment errors,
not evidence of application test failures. Browser validation remains outstanding
until a working browser installation is available; it must not be marked PASS.

## Architecture at baseline

- **Simulation**: `src/sim/`, headless TypeScript, pinned deterministic Rapier
  0.20.0, fixed 60 Hz, explicit collider, physics/feel identities and replay
  fingerprints. Do not change golden values to conceal a regression.
- **Transport / game loop**: `src/host/` Local and Worker hosts, serialized worker
  requests, fixed-tick input scheduler. `debug/main.js` samples input and runs the
  main-thread rAF loop independently of worker acknowledgements.
- **Rendering**: Three.js 0.185.1 laboratory viewport, snapshot interpolation;
  `src/render/juice.ts` has reusable headless effect primitives, while
  `debug/juice-view.js` and its separate demo are not wired to a playable round.
- **UI**: Game Feel Lab + opt-in MAX adapter; no primary arcade round lifecycle,
  height/score HUD, onboarding, Game Over or in-place restart.
- **Storage**: local playtest history in localStorage. Reads are guarded; writes
  are not. `db/` contains a PostgreSQL migration, not a deployed database client.
  `src/server/` holds validation/ranking contracts, not an HTTP backend.
- **Assets**: generated geometry, no asset directory or external art dependency;
  Three.js/Rapier runtime files vendored only in ignored `build/playtest` output.
- **Delivery**: static packager + GitHub Pages workflow; baseline server binds
  127.0.0.1 and serves the checkout. Node/browser CI already exists.

## Audit findings to address

1. Unguarded history writes abort reset/variant navigation in quota-limited or
   storage-disabled browsers (P1).
2. Main rAF and presentation timeout are not stopped by pagehide; worker failures
   keep scheduling input; export uses an unbounded timer-polling drain (P1).
3. Scheduler accepts non-finite delta (NaN permanently poisons the accumulator),
   and has no explicit queued-input reset for pause/restart (P1).
4. Worker requests have no timeout and synchronous postMessage failures leave
   pending requests retained; a stalled worker can permanently hang the UI (P1).
5. Debug server exposes the entire repository, including `.git` and any future
   `.env`; this becomes a sensitive-file disclosure on a public preview (P1).
6. Pointer jump ownership is not tracked by pointer ID; a second pointer can
   release the first pointer's hold (P1 for mobile hold-release controls).
7. No arcade terminal bounds/restart shell exists: an egg leaving the level can
   fall forever (missing product lifecycle, not a proven Rapier collision bug).

No P0 or tracked credentials were found. DOM content uses textContent/value;
no unsafe dynamic HTML sinks were found. Existing Rapier contact, reset and
golden replay tests pass; preserve those semantics and add regression coverage.
