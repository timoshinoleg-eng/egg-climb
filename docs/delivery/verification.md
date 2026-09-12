# Verification log — 2026-09-10

## Completed locally

| Check | Result |
| --- | --- |
| Node environment | 22.22.3 / Linux x64, matches `.nvmrc` |
| TypeScript build | PASS |
| `npm test` | **148 PASS, 0 failed, 0 skipped** (107 updated-main tests + 41 branch regressions) |
| Deterministic AST boundary | PASS |
| Historical golden replay / fingerprints | PASS, expected values unchanged |
| Chromium Playwright suite | **16 PASS**, including all 7 arcade scenarios and the Kitchen replay witness |
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
- **361 frames / 6008.0 ms**, average **60.09 FPS**.
- Frame **p95 16.80 ms**, max **16.80 ms**, **0 frames over 20 ms**.
- Main-thread render work **p95 0.60 ms**.
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


## Concurrent Kitchen integration

Main advanced through PR #12 (`38ef55154df98a27fd7dd32f6f0b7992f32606de`) during
the follow-up. Its conflict with the Worker constructor prevented a new PR CI
run; old green checks were not treated as validation of the new head.

The merge keeps protocol v5 level binding and Kitchen's trusted registry,
kinematics, steam, launch and authoritative Finish. It combines the fourth
`expectedLevel` parameter with a fifth watchdog timeout, migrates Cloud Garden
to explicit non-competitive `fixtureStaticBoxes`, and updates diagnostic render
geometry access. No Kitchen witness or historical golden was rewritten.

After integration: **148 unit PASS**, **16 Chromium Playwright PASS**, including
Foundation `4f677949` and Kitchen `24f443e7` with completion tick 1167 / terminal
tick 1287. The three-engine browser suite now registers **48 cases**, retaining
only the eight existing non-Chromium diagnostic-UI exclusions. Added Worker
regressions verify that timeout handling cannot weaken level identity checks.

The mobile-viewport FPS smoke was repeated after integration: **60.09 FPS**, frame
p95/max **16.80 ms**, render-work p95 **0.60 ms**, 361 frames / 6008.0 ms,
**0 frames >20 ms**, effective DPR 1.5 on device DPR 2, no browser errors. The
metrics above now refer to this integrated run. Current cross-platform CI is
tracked by [PR #13 Checks](https://github.com/timoshinoleg-eng/egg-climb/pull/13/checks).


## Playable Kitchen follow-up

The next user-selected scope adds a canonical playable Kitchen view, without
simulation/host changes. Local validation: **164 unit PASS**, **21 Chromium PASS**
(16 regression cases + 5 Kitchen cases), both legacy fingerprints unchanged.
The browser matrix registers 63 cases across the three engines, with no new skips.
Real-time Kitchen/Garden smokes both measure about 60 FPS; Kitchen used low quality
and effective DPR 1.0 in this sandbox. These are not physical-phone guarantees.

New code is not validated by the old CI run. GitHub initially returned 401/422;
access was restored on 2026-09-11 and the user authorized push. The complete local
source was checked against the downloadable recovery archive before reconciling
its history with published integration `418e93a`, without overwriting any source
or force-pushing the recovery snapshot. Build and all 164 unit tests passed again.
The new head must pass its own GitHub Actions matrix, tracked in PR #13 Checks.
Full details, keyboard-route methodology and measured quality tiers are in
[kitchen-escape.md](./kitchen-escape.md).

### Cross-browser navigation regression found during restored delivery

The first complete Kitchen UI CI found one Firefox test race: returning to Garden
painted the static mode/best score before its Worker handshake completed, while the
test immediately expected one Worker. This was not a simulation or replay mismatch.
GitHub reporter annotations were added alongside the line reporter so the exact
failure remains readable even when the log archive CDN is unavailable.

The navigation regression now awaits `ready`, the old Worker's close event and a
single new Worker with the correct URL. A gate on the returning Garden script
explicitly checks the loading/disabled-start interval before allowing initialization.
No assertion or browser project was removed. The strengthened case passed three
consecutive Chromium runs locally; the full current matrix is tracked in PR #13.

## 2026-09-12 MAX/runtime hardening follow-up

This follow-up starts from deployed `main` `ea91152a9f30607ddab898f286fd0060ae7e61ca` and does not change authoritative simulation, Kitchen level/physics, replay identity or golden fingerprints.

Changes are limited to client/runtime hardening left after PR #13 and the later MAX routing/performance fixes:

- assistive/keyboard DOM activation of directional buttons now survives exactly one simulation sample instead of being pressed and released before sampling;
- local preview MAX routing matches the packaged production route; ordinary MAX launches go to Kitchen, while MAX Lab access requires explicit `lab=1`;
- constrained MAX/coarse-touch Kitchen keeps LOW/DPR 1, reduced decoration and render stride 2, and the motion control is locked to reflect that actual profile;
- performance telemetry now separates actual presentation FPS from browser rAF cadence and exports render stride/profile plus p95 measurements;
- the performance smoke consumes the same presentation/rAF telemetry instead of treating callback cadence as rendered FPS.

Local verification after the final runtime changes:

- `npm run typecheck` — PASS;
- `npm test` — **170 PASS, 0 failed, 0 skipped**;
- targeted Chromium Kitchen + packaged-MAX browser suite — **6 PASS**;
- authoritative determinism policy — PASS.

Full Linux/Windows/macOS and Chromium/Firefox/WebKit evidence must come from the exact-head GitHub Actions run for the follow-up PR before merge. Real MAX device performance remains a human/device acceptance gate, not something desktop CI can certify.
