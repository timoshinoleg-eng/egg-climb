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
| `src/render/juice.ts` | Headless juice core: contact event detection, squash spring, trauma shake, height records. No three.js/DOM/clock/random dependencies; compiled to `dist/render/juice.js`. |
| `test/render-juice.test.mjs` | Unit tests for the core plus architecture guards (no three/DOM in the core, no CDN in the demo page). |
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

The kit is additive; adoption is a small, deliberate edit:

```js
import { createJuiceView } from './juice-view.js'

const juiceView = createJuiceView({ renderer, scene, camera, body: bodyGroup })
juiceView.reset(spawnY) // once per attempt, with the egg spawn height

// inside the fixed-tick loop, next to host/simulation stepping:
juiceView.update(PHYSICS_DT, previous, current)

// per rendered frame, after the body transform and camera lookAt:
juiceView.apply()
juiceView.observeFps(fpsEma, frameDelta)
juiceView.render(frameDelta) // replaces renderer.render(scene, camera)

// on resize:
juiceView.setSize(width, height)
```

Call `update` per simulation step (not per rendered frame) so one-tick
events — landing absorption, takeoff — are never missed when several steps
run inside a single rendered frame. `apply` must run after `camera.lookAt`
because the shake translates/rotates the camera in its local space.

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
randomness, so identical trauma curves read identically in recordings.

## Follow-ups (not in this PR)

1. Basic audio (second half of ADR step 4): synthesized WebAudio SFX or
   Kenney CC0 audio files; add howler.js only if audio management outgrows
   a few one-shot players.
2. Evaluate three.quarks for richer VFX — first verify its peer range
   against the pinned three@0.185.1; any addition must keep the no-CDN
   guard green and get a THIRD_PARTY_NOTICES entry.
3. Daily Tower (ADR step 7): reuse `JuiceEvents`/`HeightTracker` for run
   summaries; share records into MAX via the `https://max.ru/:share?text=`
   deeplink (works on iOS/Android/web; the Bridge `shareContent` method is
   mobile-only).
4. Server leaderboards: validate MAX initData (HMAC-SHA256) before
   accepting scores; the score table can live in Neon or Supabase — decide
   together with the Daily Tower PR.
