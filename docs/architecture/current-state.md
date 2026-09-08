# Egg Climb architecture: current state

## 1. Purpose and scope

Egg Climb is a browser-first physics climbing game. This document is the short
orientation map for engineers and agents working in the repository: it explains
which side of each boundary is authoritative, which contracts are intentionally
stable, and where the detailed decisions live.

It describes the implemented foundation and its explicit contracts. It does not
replace the detailed ADRs or specifications, define product roadmap, or specify
future Kitchen content, backend deployment, or final game design.

### Source-of-truth hierarchy

When sources disagree, use this order:

```text
current code and executable contracts
        ↓
accepted ADRs
        ↓
current specifications
        ↓
this overview document
```

This overview is navigation, not a competing contract. Update it when code or a
more specific accepted contract changes.

## 2. Product framing

The durable product direction is **a tiny egg escaping and climbing through a
giant human-scale world**. Kitchen Escape is the current hypothesis for the
first world and vertical slice; it is not an architectural restriction on later
worlds or on the level format.

## 3. System map

```text
Input / Mini App shell
        ↓ fixed-tick input samples
SimulationHost (Local or Worker)
        ↓ authoritative snapshots + ordered PresentationEvents
Headless deterministic simulation
        ↓
Renderer / UI / presentation-only effects

Replay ──canonical tick input evidence + identity──↔ deterministic simulation

Planned server acceptance
        ↓ validate replay and Daily identity
        ↓ killable authoritative replay execution
        ↓ canonical score and leaderboard persistence
```

The authoritative core is under [`src/sim`](../../src/sim); its consumer-facing
transport is under [`src/host`](../../src/host). Presentation contracts and
effect primitives are under [`src/presentation`](../../src/presentation) and
[`src/render`](../../src/render). The MAX playtest shell is a browser adapter,
not an alternative simulation implementation.

## 4. Authoritative boundary

Authoritative state is the tick-quantized input stream, simulation state and
physics, canonical level definition, replay evidence, and any competitive score
derived by authoritative replay execution. The simulation owns gameplay
semantics such as support contacts and accepted jumps.

The renderer, camera shake, particles, bloom, UI feedback, derived visual
caches, presentation-only randomness, and future audio or haptics are
non-authoritative. They may observe snapshots and presentation events, but may
not feed state back into input processing, physics, replay, or scoring.

The central invariant is simple: **losing or changing presentation must not
change an authoritative run result.** This is enforced structurally by keeping
the simulation headless and by using a one-way event flow.

## 5. Simulation and determinism

The simulation advances at a fixed 60 Hz and uses the pinned deterministic
Rapier package. Rendering is independent of the physics rate and interpolates
snapshots. Bodies and colliders are created in committed order; the simulation
does not import rendering, DOM, platform SDK, ambient clocks, randomness, or
uncontrolled browser APIs. The AST policy and tests make that boundary
executable.

The fingerprint is a versioned envelope over tick, explicitly serialized
authoritative state, and the Rapier snapshot. Authoritative lifecycle state
outside Rapier therefore has to enter the serialized state slot. The physics
world is freed deterministically on reset and teardown.

Golden fingerprints are regression evidence, not values to update merely to
make CI pass. A changed golden first needs an intentional, reviewed
authoritative change with the corresponding compatibility/versioning review and
cross-platform evidence.

Authoritative details are in [ADR 0001](../adr/0001-deterministic-simulation.md),
[ADR 0002](../adr/0002-determinism-hardening.md), and the
[simulation entry points](../../src/sim/index.ts).

## 6. Host and Worker boundary

`SimulationHost` is the sole gameplay transport interface. `advance()` accepts
one `TickInput` per authoritative tick (a batch only amortizes transport), and
returns a `SimulationFrame`: previous/current snapshots, number of stepped
ticks, and every ordered presentation event observed in that batch. Empty or
oversized input batches are rejected.

`LocalSimulationHost` and the browser worker run the same simulation semantics.
The worker has a typed request/response protocol for initialization, advance,
fingerprint, reset, and free. Its initialization handshake proves the protocol,
simulation, Rapier, physics, collider, and feel identities before it is trusted.
Worker requests are serialized in posting order, so concurrent promises cannot
reorder lifecycle operations. Reset starts a new attempt identity; free is
idempotent at the host boundary.

Main-thread scheduling quantizes inputs independently of worker acknowledgement
timing, bounds backlog, and drops wall-clock debt rather than inventing
unrecorded physics ticks. Local/Worker parity—including reset and chunking—is a
required semantic expectation, not an optimization goal. See
[host contracts](../../src/host/contracts.ts),
[worker protocol](../../src/host/worker-protocol.ts), and [ADR 0002](../adr/0002-determinism-hardening.md).

## 7. Replay and identity

A replay is canonical authoritative input evidence plus a versioned identity.
It records canonical tick/sequence-ordered input events and a terminal tick;
compatibility validation fails closed when the runtime cannot reproduce its
identity.

The identity covers the protocol and simulation, pinned Rapier identity,
physics preset, egg collider, feel preset, tick rate, level, generator/ruleset
identity, and controls/assist mode. A replay is not compatible just because its
inputs happen to look usable under a newer runtime.

Three related concepts must remain distinct:

- The simulation fingerprint is compact determinism/regression telemetry, not
  a cryptographic replay identifier or anti-cheat proof.
- The canonical replay hash is a SHA-256 hash of canonical authoritative replay
  evidence and is suitable for accepted-attempt content identity.
- A client fingerprint is untrusted telemetry. A mismatch is evidence worth
  recording for determinism investigation, not an automatic cheating verdict.

The precise validation and canonicalization rules are in
[`src/sim/replay.ts`](../../src/sim/replay.ts) and
[`src/server/daily-contracts.ts`](../../src/server/daily-contracts.ts).

## 8. LevelDefinition

**Current.** `LevelDefinition` is intentionally small: identity/version,
format version, origin, and ordered static boxes with geometry and friction.
The Foundation ribbon is a committed instance of this format. Canonical JSON
preserves array order, sorts object keys, rejects non-JSON/sparse values, and
feeds the level SHA-256 identity.

The key rule is:

```text
seed = provenance
canonical LevelDefinition = authoritative level truth
```

The seed is useful for debugging or generation, but replay and Daily identity
must bind the exact canonical level text and its hash. See
[`src/sim/level.ts`](../../src/sim/level.ts) and the
[Daily contract](../specs/2026-09-06-daily-tower-leaderboards.md).

**Planned / not implemented.** Kitchen-specific primitives or a procedural
Daily schema are not part of the current format. New supported level features
must be introduced through an explicit format evolution, not guessed into this
foundation contract.

## 9. Physics and game feel

`PhysicsPreset` owns gravity, explicit egg mass properties, support thresholds,
movement torque, and jump physics. The egg collider is a committed,
pre-baked asymmetric convex hull; render geometry never derives the authoritative
collider. Center of mass and principal inertia are explicit physics-owned design
constants, independent of both renderer and collider density.

`FeelPreset` is a separate immutable, versioned layer for movement space,
tap/hold-release control, and optional deterministic assists. It may alter
authoritative control behavior, so its identity and state serialization are
part of replay, worker handshake, and fingerprint compatibility. It must not
silently mutate the physics preset or collider.

Detailed contact, jump, collider, and lifecycle invariants are in
[ADR 0003](../adr/0003-physics-lab.md). The controlled feel matrix and its
playtest boundary are in [ADR 0004](../adr/0004-game-feel-lab.md), the
[game-feel design spec](../specs/2026-09-05-game-feel-design.md), and the
[playtest protocol](../game-feel-playtest.md).

## 10. Presentation architecture

The host converts exact post-tick simulation semantics into ordered
`PresentationEvent`s and sends them one way to presentation. An event identity
contains attempt, tick, kind, and ordinal; the cursor consumes the monotonic
stream exactly once without retaining an unbounded seen-set. Current emitted
events are accepted jumps and support-transition landings. `fail`, `checkpoint`,
and `finish` exist as contract-ready event kinds but are not inferred by the
current Foundation simulation.

Renderers must not reconstruct gameplay transitions from velocity heuristics.
Velocity may scale a visual impact only after an authoritative landing semantic
exists. Presentation events themselves are deliberately outside snapshot state,
replay identity, fingerprinting, and authoritative scoring.

The implemented Visual Preset foundation provides squash/stretch, additive
trauma shake, bounded pooled particles, and quality tiers. It composes squash
against a captured base transform, applies shake on a temporary camera rig, and
restores state after rendering so effects do not drift into gameplay camera
state. High quality alone may lazily use short bloom accents; Medium and Low
never construct the bloom path. Presentation quality can scale down, but it
cannot alter simulation.

Renderer lifecycle is part of the contract: disposal is idempotent, owned
resources/listeners are released, context loss stops optional rendering safely,
and restoration resumes direct rendering before any optional post-processing is
rebuilt. See the [Visual Preset v1 spec](../specs/2026-09-06-visual-preset-v1.md),
[`src/presentation/events.ts`](../../src/presentation/events.ts), and
[`src/render/juice.ts`](../../src/render/juice.ts).

## 11. Competitive score and Daily contracts

**Current contract foundation.** Authoritative replay execution samples the
egg center of mass after each completed tick, relative to level origin, and
derives historical maximum height in fixed-point millimetres. Ties preserve the
first tick at maximum height. Render rate, presentation events, and claimed
client score do not participate.

The Foundation level has no authoritative Finish semantic. `runReplay()`
therefore does not invent completion, and mixed leaderboard ordering defines
how future completed and incomplete accepted runs rank. Daily identity binds a
UTC date to immutable canonical level text/hash plus level, generator, and
ruleset identity. A published Daily is intended to be insert-once immutable.

Canonical replay hashing excludes client fingerprint telemetry. The persistence
schema separates internal MAX player identity from the nullable public display
identity, and ranking uses canonical replay-derived fields rather than client
claims. Replay admission structurally bounds ticks, events, and events per tick;
storage and future HTTP limits must remain compatible with that admitted maximum.

The authoritative detail is the [Daily Tower and leaderboard specification](../specs/2026-09-06-daily-tower-leaderboards.md), supported by
[`src/sim/scoring.ts`](../../src/sim/scoring.ts),
[`src/server/daily-contracts.ts`](../../src/server/daily-contracts.ts), and
[`db/migrations/0001_leaderboard.sql`](../../db/migrations/0001_leaderboard.sql).

## 12. Security and trust boundaries

Trusted inputs are pinned deployed server/simulation code and a canonical Daily
definition after publication. The Mini App client, claimed score, client
fingerprint, raw replay before validation, and MAX payload before signature and
freshness validation are untrusted.

The implemented MAX parser/validator is deliberately strict: malformed or
duplicate signed data fails closed, the signed user ID stays lossless as a
decimal string, and raw signed data/token material must not be logged or placed
in a client bundle. See [`src/server/max-initdata.ts`](../../src/server/max-initdata.ts).

**Planned / not implemented.** Production replay acceptance needs an HTTP
body-size guard before JSON parsing, rate limits, and a killable worker/process/
isolate for replay execution. A same-isolate promise timeout cannot stop
CPU-bound physics and is not an acceptable security boundary.

## 13. Rendering and performance tiers

Low, Medium, and High are presentation quality tiers, not game-rule variants.
They reduce render scale and particle budgets as needed; expensive postprocessing
must never be assumed available outside High. Context-loss and cleanup behavior
are performance and correctness requirements, not optional polish. Exact
budgets and effect behavior belong in the [Visual Preset spec](../specs/2026-09-06-visual-preset-v1.md), rather than this overview.

## 14. Testing and CI invariants

CI typechecks and runs Node tests—including deterministic core, replay,
host/worker, scoring, contracts, and renderer lifecycle checks—on Linux x64,
Windows x64, and macOS ARM64. Browser coverage runs the deterministic and
playtest surfaces in Chromium, Firefox, and WebKit. Property tests complement,
but do not replace, golden parity across engines and architectures.

The MAX packaging/browser suite checks the opt-in playtest shell separately.
Playwright WebKit is portability evidence, not a substitute for a real MAX or
iOS WKWebView smoke. Workflows live in [CI](../../.github/workflows/ci.yml) and
[playtest publishing](../../.github/workflows/pages.yml).

## 15. What exists and what does not

### Exists

- Headless deterministic Rapier simulation with physics and game-feel presets.
- Versioned replay, identity, fingerprint, canonical level/replay hashing, and
  replay resource-limit foundation.
- Local and Worker hosts with ordering, handshake, lifecycle, and parity tests.
- Physics Lab and Game Feel Lab fixtures/playtest export tooling.
- Ordered presentation-event and Visual Preset foundation, including lifecycle
  and quality-tier behavior.
- MAX browser playtest shell and static packaging.
- Daily, leaderboard, MAX validation, canonical scoring, and database-schema
  contract foundations.

### Planned / not implemented

- Production Daily generator and atomic Daily publication flow.
- Production HTTP replay submission and leaderboard read APIs.
- A killable production replay executor plus HTTP admission/rate-limit layer.
- An authoritative Finish/goal semantic.
- Local or network ghost gameplay.
- A production Kitchen level and Kitchen art/content.
- A final player-selected game-feel winner or full production renderer.

## 16. Architectural rules for future changes

- Treat any authoritative behavior change as a replay, fingerprint, worker,
  level, and compatibility review—not merely a gameplay tweak.
- Preserve the one-way flow from simulation/host to presentation; presentation
  never writes simulation state.
- Fail closed when replay or worker identity does not match available
  authoritative content.
- Keep canonical identity aligned with the actual authoritative level and rules,
  not merely with a seed or a client claim.
- Keep replay resource admission, HTTP body limits, and storage limits mutually
  compatible.
- Preserve Local/Worker semantic equivalence and test it after transport or
  lifecycle changes.
- Make visual additions respect event ordering, context/disposal lifecycle, and
  quality tiers.
- Prefer small focused changes with regression coverage for contract changes.

## 17. References

- [ADR 0001: deterministic simulation](../adr/0001-deterministic-simulation.md)
- [ADR 0002: determinism hardening, worker transport, telemetry](../adr/0002-determinism-hardening.md)
- [ADR 0003: Physics Lab](../adr/0003-physics-lab.md)
- [ADR 0004: Game Feel Lab](../adr/0004-game-feel-lab.md)
- [Game-feel design](../specs/2026-09-05-game-feel-design.md) and [playtest protocol](../game-feel-playtest.md)
- [Visual Preset v1](../specs/2026-09-06-visual-preset-v1.md)
- [Daily Tower and leaderboards](../specs/2026-09-06-daily-tower-leaderboards.md)
- [MAX playtest guide](../max-playtest.md)
- [Simulation entry point](../../src/sim/index.ts), [host entry point](../../src/host/index.ts), and [presentation entry point](../../src/presentation/index.ts)
