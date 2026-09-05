# ADR 0002: Cross-engine determinism, worker transport and replay telemetry

Status: Accepted before Physics Lab.

## Context

The deterministic Rapier foundation produced one golden world fingerprint across Linux, Windows and macOS Node runners. That result is necessary but insufficient for a browser-first game: Node uses V8, while real clients also include Firefox/SpiderMonkey and WebKit/JavaScriptCore. Physics Lab would also become harder to move off the main thread if UI code grew around synchronous simulation calls.

## Decision

1. Keep one authoritative simulation implementation. `createSimulationWithRapier()` builds the world; the normal Node loader and the browser Worker both call this same function.
2. Browser gameplay/debug simulation crosses an explicit `SimulationHost` transport. The main thread samples/queues one `TickInput` per fixed simulation tick and rendering consumes snapshots; neither owns Rapier bodies or calls physics APIs directly.
3. `SimulationHost.advance()` accepts one `TickInput` entry per authoritative physics tick. Batching is transport amortization only. Empty batches are invalid.
4. Worker requests are processed in posting order through a typed serialized runtime in `src/host/worker-runtime.ts`. `advance`, `fingerprint`, `reset` and `free` therefore have deterministic lifecycle ordering even if callers issue promises concurrently.
5. Worker protocol and fingerprint formats are independently versioned. The init handshake proves worker context plus simulation and exact Rapier versions before the host is considered initialized.
6. The final simulation fingerprint is a versioned canonical envelope over `tick`, an explicit versioned authoritative-state byte slot and the exact Rapier snapshot. Any future authoritative gameplay state outside Rapier must enter that slot and bump its schema version when representation changes.
7. The 32-bit fingerprint is determinism/regression telemetry only; it is not a cryptographic anti-cheat boundary or a globally unique replay identifier.
8. Every replay may carry `clientFingerprint`. It is an untrusted client claim. A server mismatch is recorded as nondeterminism telemetry and is never automatically classified as cheating.
9. Golden replay CI runs in Chromium, Firefox and WebKit in addition to Linux x64, Windows x64 and macOS arm64 Node coverage. Playwright WebKit is not a substitute for a later real iOS/WKWebView smoke test.
10. `src/sim/**` is checked with a TypeScript AST policy. Relative imports may not escape `src/sim`; external imports are fail-closed except the pinned Rapier import in `src/sim/rapier.ts`; dynamic imports, `import.meta`, ambient clocks/browser/platform IO, randomness, exponentiation/remainder, indirect `Math` aliases and non-allowlisted `Math.*` operations are rejected.
11. The typed authoritative worker runtime has a separate AST transport policy: it may import only host/sim code and may not use clocks, randomness, ambient browser state or arbitrary WASM/global escape hatches.
12. `Math.imul` is an explicit exception to the small floating-point math allowlist because the committed fingerprint implementation requires exact 32-bit multiplication.
13. Property-based tests supplement golden fixtures with replay/host/chunking equivalence; they do not replace cross-engine/cross-architecture golden tests.
14. Render timing and worker acknowledgement timing are non-authoritative. A fixed-tick scheduler samples inputs independently of worker acknowledgements, bounds catch-up debt, and queues already-quantized tick inputs for transport.

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

Exponentiation (`**`) and remainder (`%`) remain rejected by policy. The allowlist is intentionally narrow and is expanded only for a concrete authoritative need with tests and ADR review. Bitwise integer operators remain available for deterministic hashes and future integer PRNG work.

## Consequences

- Physics Lab can add contact manifolds, COM, immutable presets and collider hashes without changing replay/worker/fingerprint architecture.
- Browser-engine and transport-chunking regressions become visible before merge.
- Replay mismatch telemetry can reveal real-device nondeterminism from the first playtest.
- Worker transport remains explicit and auditable; Comlink or another RPC layer is unnecessary unless the API materially grows.
