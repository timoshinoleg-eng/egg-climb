# Verification log — 2026-09-10

## Completed locally

| Check | Result |
| --- | --- |
| Node environment | 22.22.3 / Linux x64, matches `.nvmrc` |
| TypeScript build | PASS |
| `npm test` | **134 PASS, 0 failed, 0 skipped** (95 baseline + 39 regressions) |
| Deterministic AST boundary | PASS |
| Historical golden replay / fingerprints | PASS, expected values unchanged |
| Chromium Playwright suite | **15 PASS**, including all 7 new arcade scenarios |
| `npm audit --audit-level=high` | 0 vulnerabilities; no dependency additions |
| Static package | Runtime-only assets; arcade + legacy MAX links work under `/egg-climb/` |

Browser cases cover real input → score → fall → Game Over → restart, frozen
terminal ticks, best-score persistence, disabled storage, blur/pause, reduced
motion, multi-round rAF ownership, worker teardown, a deliberately unresponsive
worker, actual touch jump, Retina sizing, scroll containment, existing laboratory
UI/exports, packaged subpaths, and Node/Worker replay parity.

## Performance smoke (measured, not a universal guarantee)

Command: `npm run test:perf`, with the debug server already running and an
explicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override in this sandbox.

- Chromium **152.0.7977.0**, from an external `@sparticuz/chromium` installation.
  It is not the Playwright-pinned Chromium 151. The fallback and its native
  libraries live outside the repository and are not dependencies/artifacts in Git.
- Mobile viewport **390 × 844**, deviceScaleFactor **2**.
- Six seconds of real repeated keyboard jumps after warm-up.
- **361 frames / 6007.7 ms**, average **60.09 FPS**.
- Frame **p95 16.80 ms**, max **16.80 ms**, **0 frames over 20 ms**.
- Main-thread render work **p95 0.80 ms**.
- Adaptive quality **medium**, effective Canvas DPR **1.5** (device DPR remains 2).
- Browser errors: **0**. Smoke gate: **PASS**.

The budget test tolerates refresh-clock jitter (>=58.5 FPS, p95 <=20 ms,
render-work p95 <8 ms). It must not be described as a hard guarantee on every
phone, GPU, refresh rate, battery mode or background browser tab. A physical
Android/iOS/MAX smoke is still required before a production performance claim.
Raw screenshots, traces and timing JSON are intentionally ignored test artifacts.

## Historical local full-matrix attempt (environment failure)

The requested `npm run build && npm test && npx playwright test` was executed.
Build and all 132 unit tests passed. Playwright reported **15 passed / 30 failed**.
Every failure was a **browser launch/environment** error: Firefox 1538 and WebKit
2336 executables are absent. None reached application assertions. No project or
check was disabled to change that result.

Both `npx playwright install --with-deps chromium firefox webkit` and the
browser-only installer were attempted. Debian mirror connections fail, and
Playwright CDN downloads fail before TLS setup with ECONNRESET. Other official
mirrors were also unreachable. An npm-distributed Chromium enabled local UI
verification but cannot substitute for Firefox or WebKit.

The user asked to continue after the draft-PR/CI route was proposed. Delivery
proceeded through a **draft PR first**, with the remaining gate evaluated on
GitHub Actions. This was an exception to the original strict step 4 → step 5
order, not a claim that missing local browser runs passed.

## Initial delivery CI gate resolved

[PR #13](https://github.com/timoshinoleg-eng/egg-climb/pull/13) is ready for review.
[CI run 34407859412](https://github.com/timoshinoleg-eng/egg-climb/actions/runs/34407859412)
is **SUCCESS** for code SHA `58dbadba996bbed1ce4df04b91cfe591b59cceca`.

| GitHub check | Observed conclusion |
| --- | --- |
| deterministic-core — Ubuntu / Linux x64 | SUCCESS |
| deterministic-core — Windows / win32 x64 | SUCCESS |
| deterministic-core — macOS 15 / darwin arm64 | SUCCESS |
| browser-determinism — pinned Chromium, Firefox, WebKit | SUCCESS |

All install, typecheck and test steps succeeded, confirmed through the GitHub
Jobs/Checks API. The browser suite registers 45 cases; eight pre-existing
non-Chromium diagnostic-WebGL UI exclusions remain unchanged. All seven new
arcade scenarios are registered on all three engines with no new skips.
The detailed log archive is unreachable from the sandbox, so an exact numerical
PASS/SKIP total from that archive is not asserted. Job success and tested SHA are
available directly at the run link above.

No merge or production deployment was performed. See the full
[Engineering & Visual Delivery Report](./engineering-visual-report.md) for
changes, source/license-checked recommendations and deployment instructions.


## Additional verification after delivery

Two further permanent regressions are in `test/arcade-run.test.mjs`:

- **100 restart cycles** with queued directional/jump input and simultaneous
  restart requests. Each round restores both snapshots, zero score/combo, empty
  queue and the exact original fingerprint.
- **Full Cloud Garden reachability** using legal steering/jump inputs. Every one
  of the nine leaves must retain at least 12 consecutive stable supporting ticks
  with the egg inside the ledge, rather than counting a glancing corner contact.
  The same inputs are then replayed through `ArcadeRun`: `summit` at tick **1728**
  (28.8 seconds of simulation), **1900 points**, combo **5**, bonus **350**.

Local build, determinism policy and **134 unit tests pass**. Runtime code, level,
physics presets and existing golden values are unchanged by this follow-up.
The previously measured rendering budget is therefore not a new performance
measurement. Current branch CI is linked from
[PR #13 Checks](https://github.com/timoshinoleg-eng/egg-climb/pull/13/checks).
