# Egg Climb

Mobile-first physics climbing game for Web/Mini Apps, with later native packaging.

## Current architecture

The authoritative gameplay simulation is a headless TypeScript module using a pinned deterministic Rapier build and a fixed 60 Hz timestep. Rendering is outside the simulation boundary and may run at any frame rate.

The browser debug client runs the same simulation core inside a dedicated Web Worker. The main thread owns input sampling, interpolation and rendering only.

The original `feat/mvp0-egg-physics` branch is a closed experimental rendering/control spike and is not the production physics architecture.

See `docs/adr/0001-deterministic-simulation.md` and `docs/adr/0002-determinism-hardening.md` for the accepted architecture and implementation order.

## Verification

```bash
npm ci
npm run typecheck
npm test
npm run test:browser
```

Node CI verifies the golden replay on Linux x64, Windows x64 and macOS arm64. Browser CI runs the same golden replay in Chromium, Firefox and WebKit. Property-based tests generate additional canonical input logs and require byte-identical replay fingerprints.

## Debug renderer

The Physics Lab needs a visual viewport before collider/contact tuning. The debug renderer deliberately uses raw Three.js without React/R3F or external assets/CDN dependencies.

```bash
npm run debug:serve
```

Open `http://127.0.0.1:4173/`. WASD/arrows are sampled by the main thread and advanced through the explicit worker transport at fixed physics ticks. The displayed sphere is intentionally the current foundation fixture; final egg collider/contact/COM work belongs to the next Physics Lab stage.
