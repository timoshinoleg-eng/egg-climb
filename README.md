# Egg Climb

Mobile-first physics climbing game for Web/Mini Apps, with later native packaging.

## Current architecture

The authoritative gameplay simulation is a headless TypeScript module using a pinned deterministic Rapier build and a fixed 60 Hz timestep. Rendering is outside the simulation boundary and may run at any frame rate.

The original `feat/mvp0-egg-physics` branch is a closed experimental rendering/control spike and is not the production physics architecture.

See `docs/adr/0001-deterministic-simulation.md` for the accepted architecture and implementation order.

## Verification

```bash
npm ci
npm run typecheck
npm test
```

## Debug renderer

The Physics Lab needs a visual viewport before collider/contact tuning. The debug renderer deliberately uses raw Three.js without React, R3F, Vite, external assets or CDN dependencies.

```bash
npm run debug:serve
```

Open `http://127.0.0.1:4173/`. WASD/arrows feed torque input at physics-tick boundaries. The displayed sphere is intentionally the current foundation fixture; final egg collider/contact/COM work belongs to the next Physics Lab stage.
