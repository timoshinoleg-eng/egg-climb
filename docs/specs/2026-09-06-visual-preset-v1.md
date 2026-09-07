# Visual Preset v1 — production-hardened juice layer

Status: implemented in PR #9. The layer is presentation-only and is designed as a safe foundation for the later Kitchen Escape renderer without changing the deterministic simulation/replay contracts.

## Invariants

1. Simulation remains authoritative. Presentation reads simulation output and never feeds state back into Rapier, input processing, replay or scoring.
2. Gameplay transitions are not reconstructed from arbitrary velocity deltas. Exact per-tick semantic fields already exposed by the deterministic core are converted into ordered presentation events at the host boundary.
3. Presentation event loss may lose VFX/audio feedback, but it can never alter the run result or fingerprint.
4. No new external dependencies. Three.js remains pinned at `0.185.1` and bloom uses only its matching `examples/jsm` passes.

## Presentation event contract

`src/presentation/events.ts` defines separate `SimulationPresentationEvent` (`jump`, `land`, `hard-land`, `fail`, `checkpoint`, `finish`) and `MetaPresentationEvent` (`personal-best`, `milestone`) unions. Every simulation presentation event has stable identity `attemptId + tick + kind + ordinal` and carries occurrence position.

The current foundation emits only transitions for which the simulation already has exact semantics: `jump` from `feel.lastJumpTick/source/strength`, and `land`/`hard-land` from `physics.grounded: false -> true`. Pre-contact vertical speed scales presentation impact only; it never decides whether a landing happened. `fail`, `checkpoint` and `finish` are contract-ready but intentionally not inferred yet.

## Local and Worker transport

`SimulationFrame` is `{ previous, current, stepped, events }`. Both `LocalSimulationHost` and `SimulationWorkerRuntime` run the same pure extractor after every completed tick and append every event in order. No event folding occurs. Worker protocol version is `4`; replay protocol, simulation version, authoritative-state version and fingerprint version are unchanged. Reset increments `attemptId`, and `PresentationEventCursor` provides monotonic exactly-once consumption without an unbounded id set.

## Juice core and semantics

`src/render/juice.ts` contains spring squash/stretch, seeded trauma shake, attempt-local maximum-height telemetry, exactly-once event consumption and quality profiles. There is no snapshot event heuristic and no Personal Best inference. `attemptMaxHeight` means only the local maximum inside the current attempt; a true PB arrives as `MetaPresentationEvent` from persistence/product logic.

## Transform layering

Squash uses `visualScale = baseScale * squashEffect`; the modified scale never feeds back as the next base. Reset/dispose restore the captured base exactly.

Camera shake lives on a temporary parent rig. The camera's base follow/lookAt transform is untouched, and the rig is cleared after every render in a `finally` block so the next follow update never observes the previous shake.

## Quality tiers and bloom

| Tier | Render scale | Particle points/burst | Bloom path |
| --- | ---: | ---: | --- |
| Low | 0.70 | 24 | impossible |
| Medium | 0.85 | 48 | impossible |
| High | 1.00 | 72 | short accents only |

Default is Medium. Auto-quality uses FPS hysteresis instead of `navigator.hardwareConcurrency`. Post-processing objects are lazy-created only while High renders an eligible `finish` or external true `personal-best` accent. Between accents High also renders directly. Medium/Low dispose any composer and never execute a full-screen bloom pass.

The fixed custom particle pool uses tier draw ranges over preallocated typed arrays. Presentation-only `Math.random()` cannot affect simulation.

## Embedded WebView lifecycle

`createJuiceView` exposes idempotent `dispose()`: particle geometry/material disposal, composer/pass/render-target disposal, body/camera restoration, and listener cleanup. On `webglcontextlost` it prevents default teardown, stops rendering, clears shake and drops optional post-processing; on `webglcontextrestored` it reapplies size/tier state and resumes direct rendering, lazily reconstructing post-processing only for a later High accent.

The demo additionally cancels RAF, removes DOM listeners and disposes owned geometries/materials/renderer on `pagehide`.

## Demo

```bash
npm run debug:serve
# http://127.0.0.1:4173/debug/juice-demo.html
```

The synthetic demo produces explicit ordered jump/landing events at its own transition source. **PB accent** sends a separate external `personal-best` meta event.

## Acceptance coverage

- semantic event extraction vs velocity-only false positives;
- stable event identity and same-tick ordering;
- exactly-once consumer behavior;
- multiple events surviving one worker batch;
- Local vs Worker event-stream and fingerprint equivalence;
- reset/attempt identity;
- squash reset/base-relative composition;
- camera shake no drift;
- Medium/Low bloom absence and tier budgets;
- context loss/restore and idempotent disposal;
- existing platform/browser determinism suites.
