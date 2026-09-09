# Egg Climb

Mobile-first physics climbing game for Web/Mini Apps, with later native packaging.

## Play Cloud Garden

```bash
npm ci
npm run debug:serve
```

Open the server at port 4173. The default route opens **Cloud Garden**, a local
arcade practice climb. Arrows / A / D roll, Space hops, Escape pauses. Mobile
buttons support simultaneous pointers. Height and combo bonuses are local-only;
the optional personal best is stored on this device, not an online leaderboard.
The help and reduced-motion buttons are in the header. No external art, fonts,
CDN, accounts or database connection are needed by the arcade.

The playable shell uses a Canvas 2D projection of the same worker-owned Rapier
simulation. The Three.js lab remains at `/debug/index.html`; existing lab/MAX
query links still redirect there. See [arcade boundaries and compatibility](docs/adr/0005-local-arcade-shell.md).

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
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

With the debug server running, `npm run test:perf` measures a six-second
390×844 / DPR 2 mobile-viewport smoke including actual jump effects. It records
FPS, p95 frame time and render work in ignored `test-results/`. This is not a
real-device performance certification. If an independently installed Chromium is
needed, `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` selects it without
disabling Firefox or WebKit projects. Standard CI uses Playwright-pinned browsers.

Node CI verifies the golden replay on Linux x64, Windows x64 and macOS arm64. Browser CI runs the same golden replay in Chromium, Firefox and WebKit. Property-based tests generate additional canonical input logs and require byte-identical replay fingerprints.

## Debug renderer

The Physics Lab needs a visual viewport before collider/contact tuning. The debug renderer deliberately uses raw Three.js without React/R3F or external assets/CDN dependencies.

```bash
npm run debug:serve
```

Open `http://127.0.0.1:4173/debug/index.html`. WASD/arrows are sampled by the main thread and advanced through the explicit worker transport at fixed physics ticks. Physics Lab renders the actual pre-baked egg hull, COM and support manifold diagnostics. Use `/debug/index.html?physics=lab-b&scenario=jump-tip` to select a worker-owned lab fixture; Space jumps from contact. See [physics decision and experiment metrics](docs/adr/0003-physics-lab.md).

## Delivery report

See the [Engineering & Visual Delivery Report](docs/delivery/engineering-visual-report.md)
for the hardening/arcade changes, measured frame budget, full CI evidence, optional
MIT/CC0 integrations and safe static deployment settings.
