# Egg Climb

Mobile-first 3D physics climbing prototype built as an original game for Web first, then MAX Mini Apps, Telegram Mini Apps, and RuStore.

## MVP0 scope

- asymmetric convex-hull egg rigid body;
- rolling via torque plus a small directional impulse;
- jump height depends on egg tip orientation (`SIDE` → `ANGLED` → `GOOD` → `PERFECT`);
- light directional jump assist for mobile controls;
- touch joystick + jump button, plus WASD/arrows + Space on desktop;
- vertical 10+ platform course, moving platform, fall reset, finish sensor;
- follow camera and compact tuning HUD;
- pure unit-tested jump/orientation functions;
- GitHub Actions test + production build.

No art or code from *Egging On* is used. Geometry and level primitives in MVP0 are generated in code.

## Stack

- React + TypeScript + Vite
- Three.js / React Three Fiber
- Rapier via `@react-three/rapier`
- Zustand
- Vitest

## Run

```bash
npm install
npm run dev
```

Desktop: WASD/arrows + Space. Mobile: left joystick + JUMP.

## Verify

```bash
npm test
npm run build
```

## Next milestones

1. Tune egg collider, torque, damping and jump thresholds on real phones.
2. Add checkpoint/casual vs hardcore game modes.
3. Replace primitive course with an original low-poly kitchen/apartment vertical level.
4. Add performance tiers, audio/haptics and asset streaming.
5. Add platform adapters for MAX and Telegram identity/share/deep links.
6. Add leaderboard, daily tower and friend challenge backend.
7. Package the same web core for RuStore after mobile WebGL stability is proven.
