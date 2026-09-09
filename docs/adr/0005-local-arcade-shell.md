# ADR 0005 — Local arcade shell, lifecycle and steering

Status: implemented for local practice, 2026-09-10.

## Scope

The existing Physics/Game Feel Lab, Foundation level, Daily acceptance contracts,
MAX playtest export and golden replays remain available and semantically stable.
The new primary arcade shell is **local practice**, not a production Daily run or
an anti-cheat leaderboard. Its local score must never be submitted as canonical
server evidence. `cloud-garden-v1` is a committed instance of existing static-box
geometry; it is not a new procedural generator or Kitchen format.

## Boundaries

- `src/game/arcade-run.ts` owns ready/playing/paused/over/resetting/error/disposed
  lifecycle above the existing `SimulationHost`. It advances one exact tick at a
  time, scores each acknowledged tick, bounds pending inputs, and fences stale
  asynchronous responses with an epoch on restart/dispose.
- One browser rAF owns presentation. Hidden pages and Game Over stop sampling;
  pause drops unsent inputs. Restart clears snapshots, score, combo, queued
  controls, visual state and scheduler telemetry, then resets the same host.
- Worker requests have a bounded watchdog and synchronous termination. The timer
  is transport-only, never a simulation clock. Shutdown settles all requests.
- Local score is 10 points per 100 mm of maximum COM climb, plus a capped 10–50
  point bonus on each genuinely higher landing. Repeated jumps/landing on the
  same platform cannot farm a combo. The persisted best is optional and untrusted.
- Fall bounds, summit and a 180-second active-tick limit end **only the local
  practice session**. They are not an authoritative Daily Finish semantic.

## Arcade steering and compatibility

A live Rapier smoke with planar rotation locks reproduced effectively stationary
lateral motion with torque-only controls (less than 0.4 m after 240–480 ticks),
which is not usable as arcade steering. Do not silently retune laboratory presets.

`PhysicsPreset.controls.driveImpulse` is an optional, validated, fixed-tick linear
impulse. Only `arcade-physics-v1` opts in, alongside explicit jump/damping values.
When absent, physics execution and the canonical preset string are unchanged.
When present, `|drive:<value>` enters the canonical physics preset hash. Both the
Worker handshake and snapshot identity bind it. Historical golden values must
remain unchanged; a legacy replay resolver rejects the new preset rather than
pretending to support it. Publishing competitive arcade replays would require a
separate explicit ruleset/level identity and replay acceptance review.

## Presentation

The arcade uses a lightweight Canvas 2D projection of the worker's planar Rapier
poses. It does not create a second physics model. Three.js remains the diagnostic
renderer. Existing headless squash/shake primitives are reused; bounded particles,
floating labels, camera interpolation and HUD are downstream-only. No effect,
quality setting, DPR, animation or random presentation value feeds back into the
host, scoring or input. Reduced motion is a rendering preference, not an assist.

## Persistence / public preview

All localStorage reads, validation and writes are fallible. A blocked getter,
malformed data, quota error or private mode falls back to memory. There is no DB
network call in gameplay. The preview server allowlists runtime paths and checks
resolved symlink destinations; it never serves `.git`, `.env`, SQL or source
secrets. Deployment serves only packaged static files, never the checkout.


## Integration with Kitchen authoritative foundation (PR #12)

The concurrent Kitchen merge `38ef55154df98a27fd7dd32f6f0b7992f32606de` is
preserved, not replaced by the arcade shell:

- Worker protocol v5 binds the selected trusted level. `WorkerSimulationHost`
  keeps `expectedLevel` as argument four; the optional request timeout is argument
  five. URL level selection, all four level identity checks, watchdogs and
  synchronous teardown coexist and have regression coverage.
- Cloud Garden explicitly uses `fixtureStaticBoxes`, the non-competitive geometry
  seam. It does not inject a fabricated descriptor into `SUPPORTED_LEVELS` or
  weaken `assertTrustedResolvedLevel`. Foundation/Kitchen remain the canonical
  registry; the local-practice snapshot's baseline descriptor is not a claim
  that its fixture geometry is eligible for canonical replay acceptance.
- Kitchen kinematics, continuous steam, edge-triggered launch, first-tick Finish
  latch, and tagged v2 authoritative state stay intact. The local arcade summit
  does not set `snapshot.gameplay.completionTick`.
- The laboratory renderer reads `FOUNDATION_LEVEL.definition.staticBoxes` after
  the descriptor migration. Diagnostic fixture export and subpath packaging are
  still supported.
- Foundation golden `4f677949` and Kitchen witness `24f443e7` (completion tick 1167,
  terminal tick 1287) remain unchanged. The full nine-leaf local arcade route also
  still reaches its summit with 1900 points at tick 1728.
