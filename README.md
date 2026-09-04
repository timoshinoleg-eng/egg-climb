# Egg Climb

Mobile-first physics climbing game for Web/Mini Apps, with later native packaging.

## Current architecture

The authoritative gameplay simulation is a headless TypeScript module using a pinned deterministic Rapier build and a fixed 60 Hz timestep. React/Three rendering is intentionally outside the simulation boundary.

The original `feat/mvp0-egg-physics` branch is an experimental rendering/control spike and is not the production physics architecture.

See `docs/adr/0001-deterministic-simulation.md` for the accepted architecture and revised implementation order.

## Foundation verification

```bash
npm ci
npm run typecheck
npm test
```

PR-A intentionally uses a spherical body and a minimal deterministic torque actuator. Contact-based egg physics, collider experiments and COM tuning belong to the Physics Lab stage.
