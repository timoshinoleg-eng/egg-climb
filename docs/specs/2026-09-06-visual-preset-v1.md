# Visual Preset v1 — juice layer

Status: implemented as an additive kit (2026-09-06). Implements ADR 0001
revised order step 4 ("Visual Preset v1 plus basic audio, isolated from
simulation"). Audio is intentionally a follow-up.

## Goals

1. Make the debug renderer feel alive before any production art exists:
   squash & stretch, camera trauma shake, landing dust, takeoff sparks,
   height-record celebration, optional bloom.
2. Preserve the deterministic architecture: juice consumes simulation
   snapshots and never writes back (ADR 0001 rule 8). No new npm
   dependencies; bloom comes from `three/examples/jsm` inside the pinned
   `three@0.185.1`. No CDN references, matching the existing architecture
   guard for `debug/index.html`.
3. Stay honest about performance in the MAX WebView: quality tiers with
   hysteresis, driven by a render-FPS EMA.

## Files

| File | Role |
| --- | --- |
| `src/render/juice.ts` | Headless juice core: contact event detection, batch merging (`mergeContactEvents`), squash spring, trauma shake, height records. No three.js/DOM/clock/random dependencies; compiled to `dist/render/juice.js`. |
| `test/render-juice.test.mjs` | Unit tests for the core plus architecture guards (no three/DOM in the core, no CDN in the demo page), incl. regression tests for smooth-climb records and post-reset shake determinism. |
| `debug/juice-view.js` | three.js binding: squash on the body group, camera shake after `lookAt`, pooled `THREE.Points` particles, bloom chain, quality tiers. |
| `debug/juice-demo.html` / `debug/juice-demo.js` | Self-contained showcase on synthetic 60 Hz kinematics; no simulation changes required. |
| this document | Contract and adoption guide. |

## Try it

```bash
npm run debug:serve
# open http://127.0.0.1:4173/debug/juice-demo.html
```

Space / tap forces the next jump. Bloom and auto-quality can be toggled
from the top bar. Weak jumps in the pattern deliberately fall short to show
high-impact landings; accent platforms mark every fifth ledge.

## Production wiring (debug/main.js)

The kit is additive. The wiring depends on where per-tick visibility lives,
and the current worker protocol matters here.

**Worker reality (verified in `src/host/worker-runtime.ts`).**
`WorkerSimulationHost.advance(inputs)` runs the whole input batch in the
worker but returns only the last `{ previous, current, stepped }` of the
batch. Contact events that begin and end inside the batch never appear in
a UI-side `detectContactEvents(previous, current)` call.

**Option A — first playtest integration (acceptable, lossy).** Feed the
batch-edge pair; events are detected only at batch edges. At 60 fps most
batches are 1–2 ticks, so misses are rare but real.

```js
import { createJuiceView } from './juice-view.js'

const juiceView = createJuiceView({ renderer, scene, camera, body: bodyGroup })
juiceView.reset(spawnY) // once per attempt, with the egg spawn height

// after each host.advance() resolves:
juiceView.update(PHYSICS_DT * result.stepped, result.previous, result.current)

// per rendered frame, after the body transform and camera lookAt:
juiceView.apply()
juiceView.observeFps(fpsEma, frameDelta)
juiceView.render(frameDelta) // replaces renderer.render(scene, camera)

// on resize:
juiceView.setSize(width, height)
```

**Option B — event-accurate (recommended before public playtests).**
Compute events where the ticks happen — inside the worker — and fold them
on the UI thread:

1. In `worker-runtime`'s advance loop, call `detectContactEvents(prev,
   curr)` per tick and collect the array.
2. Extend the `advanced` frame message with `events: ContactEvents[]`
   (compact structured-clone payload — far cheaper than streaming every
   snapshot).
3. On the UI thread fold the batch:

```js
import { mergeContactEvents } from '../dist/render/juice.js'
const merged = mergeContactEvents(result.events)
juiceView.updateWithEvents(PHYSICS_DT * result.stepped, merged, result.current)
```

The deterministic boundary stays intact: `detectContactEvents` is a pure
function of snapshots, and the UI never reaches into the worker. Option B
requires a `WORKER_PROTOCOL_VERSION` bump and updates to the transport
equivalence tests — schedule it as its own PR.

`apply` must run after `camera.lookAt` because the shake translates/rotates
the camera in its local space.

## Quality tiers

| Tier | Bloom | Particles | When |
| --- | --- | --- | --- |
| high | on | full | default |
| medium | off | full | fps < 45 for 2 s |
| low | off | reduced (small impacts and sparks skipped) | fps < 45 for another 2 s |

Recovery to a higher tier needs fps > 55 sustained for 8 s (hysteresis
against flapping). Auto-quality can be disabled for playtest tuning.

## Event contract

`detectContactEvents(prev, curr)` is purely kinematic — a landing is a fast
fall absorbed in one tick, a jump is a near-rest body leaving upward. It
needs only `{ tick, position, linearVelocity, angularVelocity }`, a
structural subset of `SimulationSnapshot`, so Physics Lab preset changes
cannot break it. Same-tick pairs (paused sim, replay inspection) emit
nothing. The camera shake uses seeded value noise instead of ambient
randomness, and `reset()` restarts the noise clock, so identical trauma
curves read identically across attempts and recordings.

`HeightTracker` measures the celebration margin from the last celebrated
height while the true maximum tracks independently — smooth 60 Hz climbs
still accumulate toward a record (covered by a regression test).

## Follow-ups (not in this PR)

1. Worker protocol Option B: per-tick `ContactEvents[]` in the `advanced`
   frame + transport tests + protocol version bump.
2. Basic audio (second half of ADR step 4): synthesized WebAudio SFX or
   Kenney CC0 audio files; add howler.js only if audio management outgrows
   a few one-shot players.
3. Evaluate three.quarks for richer VFX — first verify its peer range
   against the pinned three@0.185.1; any addition must keep the no-CDN
   guard green and get a THIRD_PARTY_NOTICES entry.
4. Daily Tower (ADR step 7): reuse `JuiceEvents`/`HeightTracker` for run
   summaries; share records into MAX via the `https://max.ru/:share?text=`
   deeplink (works on iOS/Android/web; the Bridge `shareContent` method is
   mobile-only).
