# ADR 0002: Cross-engine determinism, worker transport and replay telemetry

Status: Accepted before Physics Lab.

## Context

The deterministic Rapier foundation produced one golden world fingerprint across Linux, Windows and macOS Node runners. That result is necessary but insufficient for a browser-first game: Node uses V8, while real clients also include Firefox/SpiderMonkey and WebKit/JavaScriptCore. Physics Lab would also become harder to move off the main thread if UI code grew around synchronous simulation calls.

## Decision

1. Keep one authoritative simulation implementation. `createSimulationWithRapier()` builds the world; the normal Node loader and the browser Worker both call this same function.
2. Browser gameplay/debug simulation crosses an explicit `SimulationHost` transport. The main thread may sample input and render snapshots but does not own Rapier bodies or call physics APIs directly.
3. Golden replay CI runs in Chromium, Firefox and WebKit in addition to Node OS/CPU coverage.
4. Every replay may carry `clientFingerprint`, the final world fingerprint calculated by the client. A server mismatch is recorded as nondeterminism telemetry; it is not automatically classified as cheating.
5. `src/sim/**` is checked with a TypeScript AST policy. External imports are fail-closed except the pinned Rapier import in `src/sim/rapier.ts`; ambient clocks, browser/platform IO, randomness, exponentiation/remainder, and non-allowlisted `Math.*` operations are rejected.
6. `Math.imul` is an explicit exception to the small floating-point math allowlist because the committed fingerprint implementation requires exact 32-bit multiplication.
7. Property-based replay tests supplement golden fixtures; they do not replace golden cross-engine/cross-architecture tests.
8. Worker scheduling is non-authoritative. Only fixed simulation ticks and the input state sampled/applied at those ticks matter to replay determinism.

## Deterministic math policy

Allowed `Math` calls in authoritative simulation:

- `Math.abs`
- `Math.min`
- `Math.max`
- `Math.floor`
- `Math.sign`
- `Math.sqrt`
- `Math.fround`
- `Math.imul` (integer fingerprint/hash exception)

The policy can be amended only deliberately with tests and ADR review.

## Consequences

- Physics Lab can add contact manifolds, COM and collider presets without coupling them to React, rendering or wall-clock time.
- A browser-engine regression becomes visible before merge.
- Replay mismatch telemetry can reveal real-device nondeterminism from the first playtest.
- The worker protocol stays intentionally small; Comlink or another RPC layer is unnecessary unless the API materially grows.
