# ADR 0006 — Playable canonical Kitchen, read-only oblique presentation

Status: implemented, 2026-09-10. Requested as a follow-up to the Cloud Garden delivery.

## Content and simulation

`play/kitchen.html` is a playable client of `KITCHEN_LEVEL`, `PHYSICS_V1` and
`DEFAULT_FEEL`. Its dedicated Worker uses `KITCHEN_OPTIONS` without fixture boxes,
spawn overrides, assists or URL-selected physics. The trusted level registry,
Worker protocol v5, Kitchen definition/hash and simulation are unchanged.

The existing round lifecycle is shared through a `RoundRules` policy.
`KitchenRun` changes only local session bounds, the initial landing-score baseline
(the table is at origin Y=2), and the terminal observation. Kitchen victory requires
a positive `snapshot.gameplay.completionTick <= snapshot.tick`; height, X progress,
render geometry or entering a cosmetic ring cannot award it. The client stops at
the first authoritative Finish, while replay execution can continue to its separate
terminal tick. The unchanged Kitchen witness still completes at 1167 and fingerprints
as `24f443e7` at 1287; Foundation remains `4f677949`.

Score and persisted best are still client-local practice metadata, not an accepted
Daily leaderboard submission. Kitchen and Garden use separate best-score keys.

## Renderer

The Kitchen is an oblique Canvas 2D projection of the authoritative **3D** coordinates,
not a second 2D simulation. X/Y/Z movement remains available through keyboard or a
four-direction touch pad. This avoids introducing a WebGL requirement for playable
UI tests in Firefox/WebKit and keeps the existing Three.js diagnostic lab intact.

- Solid surfaces use all eight corners of each canonical box, with authored
  rotation and depth-sorted faces. Face materials and egg artwork are original,
  generated once and reused; there are no downloaded textures/fonts/CDNs.
- Moving cabinet positions interpolate `kinematicOffsetAtTick` between the supplied
  previous/current simulation ticks. No render-time sine wave advances a collider.
- Steam feedback observes `activeContinuousForceZoneIds`; toaster feedback consumes
  ordered `launch` events through the existing exactly-once presentation cursor.
- Finish feedback observes the simulation latch. Route progress is capped below
  100 percent until that latch exists.
- Background wall/floor/cupboard illustrations are scenery, not additional colliders.
  They never change the canonical room or collision semantics.
- A bounded 160-slot presentation particle pool carries depth as well as X/Y;
  six floating-label slots are reused. The Garden retains its 128-slot pool.
- Overview/follow camera, squash, dust, steam and sparks are presentation-only.
  Reduced motion suppresses optional decoration; meaningful cabinet movement remains
  visible because it must continue to agree with physics.

## Lifecycle and routing

Both static pages use `play/main.js` and a closed `gameMode()` profile selection.
Mode-specific views are loaded lazily. A disposed page cannot create a Worker after
an asynchronous view import resolves. Navigation tears down the old Worker/rAF;
restart clears cues, completion, queues and controls through the existing epoch fence.

The default route remains Garden. Kitchen is available from the world tabs,
`/play/kitchen.html`, or `/?mode=kitchen`. Static packaging preserves the project
subpath and never ships test witnesses, keyboard drivers or transport observers.

## Verification

Node regressions cover exact canonical options, score baseline, Finish semantics,
restart, independent best keys, 3D bounds/projection, transformed corners, tick-based
kinematics, identity validation, rendering non-interference and bounded particles.

Browser gameplay uses real Playwright keyboard events and the public UI. A test-only
Worker observer reads requests/responses without modifying them; Playwright's clock
makes input sampling reproducible. Every emitted input is compared to the intended
keyboard sequence. No production setter/replay/autoplay test API is exposed.

The canonical witness flies **above** the steam volume. Its keyboard-compatible
variant therefore verifies toaster + Finish, not steam. A second legal keyboard
route skips the pre-toaster jump at 873/874, enters steam at 901, and verifies the
visible LIFTING indicator and reset. The level/physics/witness are not changed to
force a test assertion.

Performance uses a separate real-time browser run, never the mocked e2e clock.
The first rAF establishes the measurement origin rather than counting a partial
initial interval. The smoke also requires an active round, advancing tick telemetry
and a drained transport queue. `test:perf:kitchen` measures the full-room overview;
`test:perf` remains a Garden regression. Neither is physical-device certification.
