# ADR 0003 — Physics Lab: contact-driven egg physics-v1

Status: accepted for the Physics Lab foundation.

## Decision

The authoritative egg is a single pre-baked asymmetric convex mesh. Runtime physics never derives collision geometry from Three/React assets and never generates the hull with trigonometry.

Physics preset identity:

- id: `physics-v1`
- version: `1`
- deterministic hash: `ce73c5de`

Collider identity:

- id: `egg-convex-v1`
- version: `1`
- deterministic hash: `c7ac9e44`
- geometry: 62 committed vertices, 120 committed triangles
- local Y extent: `-0.62` broad/base end to `+0.80` narrow/tip end

The collider has density zero. Rigid-body mass properties are explicit and therefore independent of render geometry and collider-derived density:

- mass: `1.1`
- center of mass: `(0, -0.12, 0)`
- principal inertia: `(0.14, 0.096, 0.14)`
- linear damping: `0.18`
- angular damping: `0.22`
- CCD: enabled

The inertia values are explicitly specified mass-distribution design constants, not a claim of homogeneous hull integration. The lower COM is independent of the collision surface.

## Support contact and contactT

Grounded is not an orientation test and not a downward raycast. Every tick the simulation enumerates Rapier contact pairs for the egg collider, walks their manifolds, handles the egg on either collider side using the manifold `flipped` flag, and reads the egg-local contact point.

A contact is support only when its normal opposes gravity strongly enough (`supportNormal.y >= 0.45`) and its contact distance is within `0.025`. Wall-only contact therefore does not ground the egg. Cached pre-solver contact points are reprojected through the current collider transforms to reject support after separation. With multiple support contacts, the deterministic primary contact is the deepest eligible contact, then ties are broken by up-dot and local coordinates.

Continuous contact quality is:

`contactT = clamp01((localContactY - (-0.62)) / (0.80 - (-0.62)))`

So `0` is the broad base and `1` is the narrow tip. UI labels, if added later, are presentation only.

## Jump

Jump consumes the tick-exact `jumpDown` edge and requires a current support contact. A jump latch prevents another impulse until separation is observed; this future-affecting state is serialized in authoritative state version 3. A regression test reproduces the former cached-manifold airborne double impulse.

Strength uses a smooth continuous curve:

`eased = t² * (3 - 2t)`

`strength = 2.6 + (5.2 - 2.6) * eased`

The chosen direction model is `BLEND`:

`direction = normalize(worldUp * 0.85 + supportNormal * 0.15)`

No render-side correction or hidden vertical boost is authoritative.

## Candidate matrix

The reproducible harness `scripts/physics-lab-experiment.mjs` compares three immutable candidates. Full unrounded measurements are committed in `docs/physics-lab-metrics.json`; `test/physics-lab.test.mjs` runs the experiment on each Node CI platform.

| candidate | curve | COM Y | up / normal | base rise | side rise | tip rise | side recovery ticks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| lab-a | linear | -0.08 | .90 / .10 | .252 | .413 | .915 | 116 |
| **physics-v1 (lab-b)** | **smoothstep** | **-.12** | **.85 / .15** | **.273** | **.409** | **1.071** | **82** |
| lab-c | t squared | -.16 | .80 / .20 | .294 | .357 | 1.237 | 76 |

Rise measures body-origin apex relative to launch height over 240 ticks. Recovery means 15 consecutive supported ticks with linear speed below .15 and angular speed below .2 after first landing; a null result means no recovery in the observation window. Exact inverted tip launches can land balanced by symmetry; the separate perturbation experiment measures instability.

Candidate C fails the desired .1 side-over-base rise margin. B recovers from the side launch 34 ticks sooner than A, maintains the reward margins, and remains controllable in both directions (90-tick torque yields X about -1.107 / +1.118). This is a transparent foundation choice, not a claim of final game feel.

An isolated COM comparison keeps every other parameter fixed: after a 5-degree broad-base perturbation and 180 ticks, COM -.12 gives local-up Y .936, while COM 0 gives -.075. Thus the explicit mass distribution materially changes return behavior. The perturbed tip departs inversion and has peak angular speed 3.644 versus base 1.112.

An isolated 20-degree slope experiment compares normal weights 0, .10, .15, .20, 1 with the same curve/COM. Weight .15 keeps rise .317 (world-up .318, pure normal .281) and has the lowest maximum X displacement over the 240-tick landing window, 1.514 (world-up 1.697). These figures include post-landing motion, not only flight. None of the slope variants settles during that window; slope recovery remains a playtest concern rather than an unreported success.

## Determinism and compatibility

Replay compatibility is fail-closed on physics preset id/version/hash and egg collider id/version/hash. The worker handshake binds the same identities. The fingerprint authoritative-state slot serializes those identities in addition to the Rapier snapshot.

The previous PR candidate golden was `2f2e18b0`. The current candidate is `ad1821c5`: preset curve identity and the jump latch/contact separation repair intentionally change its envelope. Golden promotion is pending the cross-platform evidence run; no per-platform golden is permitted.

Playwright Chromium, Firefox, and WebKit remain required before merge. WebKit coverage is useful portability evidence but is not a real iOS WKWebView/device proof; a real-device smoke test remains future work.

## Scripted Physics Lab coverage

Fixtures cover broad-base rest, side rest, tip-biased contact, slope contact, corner/multiple contact, wall-only contact, airborne falling, landing, base/side/tip jumps, repeated deterministic replay/reset behavior, and high-angular-velocity impact.

## Consequences / next stage

Physics Lab intentionally stops before production level/content/visual polish. The next stage is the playtest matrix + game feel work: 2.5D vs 3D, TAP vs HOLD_RELEASE, input buffering, coyote time, tip-hold assist, and first VisualPreset/juice experiments.

## Debug

`/?physics=lab-a&scenario=jump-tip` selects a worker-owned experiment. `lab-b` aliases the selected physics-v1; `lab-c` is the stronger tip-reward candidate. The hull, visible red COM, local axis, support point/normal, contactT, strength, quality, trajectory and apex are debug-only. Diagnostics are sampled worker snapshots and may miss an exact apex under transport batching; scripted measurements are tick-exact.
