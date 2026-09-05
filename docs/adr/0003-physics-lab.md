# ADR 0003 — Physics Lab: contact-driven egg physics-v1

Status: accepted for the Physics Lab foundation.

## Decision

The authoritative egg is a single pre-baked asymmetric convex mesh. Runtime physics never derives collision geometry from Three/React assets and never generates the hull with trigonometry.

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

The inertia values were seeded from the homogeneous committed hull mass estimate; the lower COM is an intentional gameplay mass-distribution choice independent of the collision surface.

## Support contact and contactT

Grounded is not an orientation test and not a downward raycast. Every tick the simulation enumerates Rapier contact pairs for the egg collider, walks their manifolds, handles the egg on either collider side using the manifold `flipped` flag, and reads the egg-local contact point.

A contact is support only when its normal opposes gravity strongly enough (`supportNormal.y >= 0.45`) and its contact distance is within `0.025`. Wall-only contact therefore does not ground the egg. With multiple support contacts, the deterministic primary contact is the deepest eligible contact, then ties are broken by up-dot and local coordinates.

Continuous contact quality is:

`contactT = clamp01((localContactY - (-0.62)) / (0.80 - (-0.62)))`

So `0` is the broad base and `1` is the narrow tip. UI labels, if added later, are presentation only.

## Jump

Jump consumes the tick-exact `jumpDown` edge and requires a current support contact.

Strength uses a smooth continuous curve:

`eased = t² * (3 - 2t)`

`strength = 2.6 + (5.2 - 2.6) * eased`

The chosen direction model is `BLEND`:

`direction = normalize(worldUp * 0.85 + supportNormal * 0.15)`

No render-side correction or hidden vertical boost is authoritative.

## Candidate matrix

A compact scripted experiment compared three candidates under identical base/side/tip fixtures:

| candidate | COM Y | world-up / normal | base rise | side rise | tip rise |
| --- | ---: | ---: | ---: | ---: | ---: |
| physics-lab-a | -0.08 | 0.90 / 0.10 | 0.252 | 0.367 | 0.915 |
| **physics-v1** | **-0.12** | **0.85 / 0.15** | **0.273** | **0.409** | **1.071** |
| physics-lab-c | -0.16 | 0.80 / 0.20 | 0.294 | 0.454 | 1.237 |

`physics-v1` is the middle candidate: it preserves a clear base < side < tip reward without taking the more aggressive tip height and normal influence of candidate C.

A 5-degree perturbation fixture also demonstrates the intended stability asymmetry. The broad-base run finishes with local up-dot about `0.903` and max angular speed about `1.112`; the tip-biased run departs much farther and reaches about `2.416` max angular speed.

## Determinism and compatibility

Replay compatibility is fail-closed on physics preset id/version/hash and egg collider id/version/hash. The worker handshake binds the same identities. The fingerprint authoritative-state slot serializes those identities in addition to the Rapier snapshot.

The new golden replay fingerprint is `2f2e18b0`. Before accepting it, the same value and the same Physics Lab metrics were observed on GitHub Actions Linux x64, Windows x64, and macOS ARM64.

Playwright Chromium, Firefox, and WebKit remain required before merge. WebKit coverage is useful portability evidence but is not a real iOS WKWebView/device proof; a real-device smoke test remains future work.

## Scripted Physics Lab coverage

Fixtures cover broad-base rest, side rest, tip-biased contact, slope contact, corner/multiple contact, wall-only contact, airborne falling, landing, base/side/tip jumps, repeated deterministic replay/reset behavior, and high-angular-velocity impact.

## Consequences / next stage

Physics Lab intentionally stops before production level/content/visual polish. The next stage is the playtest matrix + game feel work: 2.5D vs 3D, TAP vs HOLD_RELEASE, input buffering, coyote time, tip-hold assist, and first VisualPreset/juice experiments.
