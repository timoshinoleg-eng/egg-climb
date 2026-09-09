# Kitchen Escape Rendered Graybox v0.1

## Purpose

This surface is the first playable presentation of the committed Kitchen authoritative level. Its job is to validate the product fantasy — a tiny egg escaping through a giant human kitchen — without changing physics, replay, scoring or competitive authority.

The canonical Kitchen LevelDefinition remains the source of truth for collision, kinematic motion, force/launch zones and Finish. Rendering is presentation-only.

## Route

The authored progression is:

`table → cutting board → counter → toaster → steam → fridge → moving cabinet → hood → vent`

The renderer may exaggerate household geometry and add non-colliding scale anchors, but it must not imply a different traversal order or invent authoritative surfaces.

## Camera

The Kitchen uses an open dollhouse/cutaway composition. The camera-side wall is absent by design to reduce occlusion.

The base camera is authored as four route regions:

1. table → counter;
2. toaster → steam;
3. fridge → moving cabinet;
4. hood → vent.

Each region provides a 3/4 camera offset and a forward route look-ahead. Camera position and look target converge with frame-rate-independent exponential damping. Egg rotation never rotates the base camera. Existing trauma shake remains an additive presentation layer and is cleared after rendering.

## Visual hierarchy

- Playable route surfaces use the highest local value/readability.
- Decorative geometry is lower contrast and never creates collision.
- Toaster launch uses a warm local flash.
- Steam is a localized vertical visual volume around the committed `coffee-steam` zone.
- The moving cabinet follows the authoritative kinematic definition and simulation tick.
- The vent uses a distinct cyan/green exit cue.

The graybox uses only Three.js primitives. External asset packs are deliberately deferred until route readability and camera behavior are validated.

## Controls

The default playtest feel is `2d-tap-assist`, keeping the first Kitchen test focused on horizontal route readability rather than depth steering. Desktop controls are Left/Right or A/D plus Space. Mobile controls provide Left, Right and Jump.

The feel preset is a playtest choice, not a new simulation contract, and may be overridden by query string.

## Retry and playtest telemetry

A presentation-only fall threshold ends a manual attempt when the egg drops below the authored kitchen. This does not create an authoritative fail state and is not replay/scoring evidence.

Retry calls the existing Worker reset contract and starts a fresh presentation attempt immediately.

Local playtest telemetry records:

- attempt duration;
- maximum height relative to Kitchen origin;
- furthest route section reached;
- authoritative completion tick when present;
- retry count;
- selected feel and visual quality.

Records are kept locally under `egg-climb-kitchen-playtest-v1` and can be exported as JSON. No analytics backend is introduced.

## Quality and rendering

The surface reuses Visual Preset v1 (`createJuiceView`): squash/stretch, additive shake, particles, quality tiers, context-loss recovery and High-only bloom behavior remain presentation-only.

Low/Medium avoid realtime post-processing. High may lazily load the already accepted Three.js post-processing modules. The static playtest package includes those modules so the High path remains self-contained.

## Acceptance gate

The rendered graybox is ready for human playtest when:

- the player can identify the tiny-egg/giant-kitchen fantasy quickly;
- the next landing is visible before committing to a jump;
- toaster, steam and moving cabinet are visually distinct mechanics;
- the vent is a clear goal;
- restart is immediate;
- mobile Chromium smoke runs without console/page errors;
- existing deterministic Node and cross-engine browser suites remain green.

Production art, external assets, audio, procedural generation, backend services and ghosts are outside this stage.
