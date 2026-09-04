# ADR 0002: Cross-engine determinism, worker transport and replay telemetry

Status: Accepted before Physics Lab.

## Context

The deterministic Rapier foundation produced one golden world fingerprint across Linux, Windows and macOS Node runners. That result is necessary but insufficient for a browser-first game: Node uses V8, while real clients also include Firefox/SpiderMonkey and WebKit/JavaScriptCore. Physics Lab would also become harder to move off the main thread if UI code grew around synchronous simulation calls.

## Decision

1. Keep one authoritative simulation implementation. `createSimulationWithRapier()` builds the world; the normal Node loader and the browser Worker both call this same function.
2. Browser gameplay/debug simulation crosses an explicit `SimulationHost` transport. The main thread may sample input and render snapshots but does not own Rapier bodies or call physics APIs directly.
3. `SimulationHost.advance()` accepts one `TickInput` entry per authoritative physics tick. A batch is only transport amortization; it is never permission to smear one input sample across multiple ticks.
4. Worker requests are processed in posting order through an explicit serialized queue. `advance`, `fingerprint`, `reset` and `free` therefore have deterministic lifecycle ordering even if callers issue promises concurrently.
5. The Worker exposes the authoritative final fingerprint so real clients can attach it to replay telemetry.
6. Golden replay CI runs in Chromium, Firefox and WebKit in addition to Node OS/CPU coverage.
7. Every replay may carry `clientFingerprint`, the final world fingerprint calculated by the client. A server mismatch is recorded as nondeterminism telemetry; it is not automatically classified as cheating.
8. `src/sim/**` is checked with a TypeScript AST policy. Relative imports may not escape `src/sim`; external imports are fail-closed except the pinned Rapier import in `src/sim/rapier.ts`; dynamic imports, ambient clocks, browser/platform IO, randomness, exponentiation/remainder, indirect `Math` aliases and non-allowlisted `Math.*` operations are rejected.
9. `Math.imul` is an explicit exception to the small floating-point math allowlist because the committed fingerprint implementation requires exact 32-bit multiplication.
10. Property-based replay tests supplement golden fixtures; they do not replace golden cross-engine/cross-architecture tests.
11. Worker scheduling and render timing are non-authoritative. Only fixed simulation ticks and the exact input entry applied at each tick matter to replay determinism.

## Deterministic math policy

Allowed direct `Math` calls in authoritative simulation:

- `Math.abs`
- `Math.min`
- `Math.max`
- `Math.floor`
- `Math.sign`
- `Math.sqrt`
- `Math.fround`
- `Math.imul` (integer fingerprint/hash exception)

Exponentiation (`**`) and remainder (`%`) are rejected by policy. Bitwise integer operators remain available for deterministic hashes and future integer PRNG work. The policy can be amended only deliberately with tests and ADR review.

## Consequences

- Physics Lab can add contact manifolds, COM and collider presets without coupling them to React, rendering or wall-clock time.
- A browser-engine regression becomes visible before merge.
- Replay mismatch telemetry can reveal real-device nondeterminism from the first playtest.
- Worker transport remains explicit and auditable; Comlink or another RPC layer is unnecessary unless the API materially grows.
