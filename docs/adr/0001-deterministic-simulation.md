# ADR 0001: Deterministic headless simulation owns gameplay physics

Status: Accepted for MVP0 foundation.

## Decision

1. `src/sim/**` is headless and may not import React, Three.js, R3F, DOM or platform SDKs.
2. Use `@dimforge/rapier3d-deterministic-compat@0.20.0` directly during the foundation phase. `compat` is chosen for identical browser/Node loading semantics; its bundle-size cost will be measured before release and may later be replaced by the matching non-compat deterministic package without changing the simulation API.
3. Physics advances at exactly 60 Hz. Render FPS is independent and will interpolate snapshots.
4. Simulation bodies/colliders are created in explicit committed array order. Procedural Daily Tower generation is not part of this PR.
5. Inputs are sampled/recorded on physics-tick boundaries and replayed by tick and canonical sequence number.
6. Replay metadata pins simulation version, Rapier package/version, physics preset, tick rate, level version and mode identifiers.
7. The current sphere and torque actuator are foundation fixtures only. Correct egg collider, contact manifolds, COM, grounded state and jump curve are a later Physics Lab PR.
8. Visual effects, sound, camera, haptics and UI consume simulation state/events and never modify authoritative physics.
9. A server validator is intentionally deferred until game feel survives playtesting. Replay reproducibility is implemented now so validator work does not require an architectural rewrite.

## Revised order

1. Deterministic headless core and replay contract.
2. Thin renderer/debug bridge with interpolation; no production polish.
3. Physics Lab: collider bake-off, contact-based grounded/orientation, COM and continuous jump curve.
4. Visual Preset v1 plus basic audio, isolated from simulation.
5. 2.5D/3D and tap/hold-release matrix on one ribbon level, with telemetry.
6. Select the winning format and build one polished 1–3 minute run.
7. Daily Tower, server replay validation and leaderboard acceptance rules.
8. Platform adapters: Web, Telegram, Yandex, MAX, VK, then RuStore packaging.
9. Monetization and broader content only after retention evidence.
