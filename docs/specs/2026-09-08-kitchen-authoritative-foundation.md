# Kitchen authoritative foundation

Status: implemented authoritative foundation; rendered graybox is deferred.

## LevelDefinition v2 and resolution

Format v1 remains the exact Foundation contract. Format v2 adds a spawn, ordered static and kinematic boxes, ordered continuous-force and edge-triggered launch zones, and ordered finish volumes. AABB membership is inclusive on all six faces. Canonical JSON preserves every authored array order; the committed SHA-256 binds the exact definition.

Every primitive has an exact fail-closed schema: missing required fields, unknown fields, fields belonging to another primitive kind, duplicate ids, malformed/non-finite vectors, and invalid half-extents are rejected. Kinematic motion uses a cardinal unit axis, a non-negative finite distance, a positive safe-integer `travelTicks`, and a non-negative safe-integer `phaseTick`; this keeps authored `distance` unambiguous.

Competitive execution never accepts a replay-supplied definition. Its header is resolved against the committed Foundation/Kitchen registry as one descriptor containing definition, id, level/format versions, hash, origin, generator provenance, seed, and ruleset hash. Any mismatch fails closed. `replayHeaderForLevel()` builds headers from that descriptor; `defaultReplayHeader()` remains the Foundation compatibility wrapper.

## Completed-tick order

For authoritative tick `t` (whose completed snapshot is `t + 1`), processing is:

1. Set every kinematic body's next transform for completed tick `t + 1`.
2. Test the pre-step egg translation against continuous and launch zones.
3. Apply continuous impulses once per containing zone, then newly-entered launch impulses in authored order.
4. Apply normal movement torque, support/contact feel processing, jump impulse, and tip damping.
5. Call `world.step()` and increment the authoritative tick.
6. Test the post-step egg translation against Finish and latch the first completed tick.

No wall clock, render delta, frame callback, presentation state, or randomness participates.

## Mechanics

Kinematic boxes use a position-based Rapier body and an exact authored triangle wave. `travelTicks` is one-way duration: tick 0 is the start, `travelTicks` is the far endpoint, and `2 * travelTicks` returns to start. Phase derives only from authoritative tick; reset reconstructs tick zero.

Steam is a continuous inclusive AABB. Its authored impulse is applied at most once per authoritative tick when the pre-step egg translation is inside. It has no retained activation state. The committed Kitchen `coffee-steam` zone is intentionally local to the toaster/fridge section and its impulse is predominantly vertical; it is not a level-wide conveyor.

Toaster launch zones use `outside -> inside` activation. `inside -> inside` does not retrigger; leaving rearms; a later entry triggers again. Each zone has an independent authoritative inside bit. Starting inside triggers on the first step because reset initializes every bit to outside.

Finish is an inclusive AABB checked post-step. `completionTick` is the first completed simulation tick inside any finish volume, is immutable, and is independent from height scoring. Tick zero never completes. Replay `finishTick` remains the terminal replay tick; later replay ticks cannot change the first completion tick.

The committed Kitchen regression evidence uses a frozen replay with real movement/jump input. It reaches the vent Finish at completed tick `1167` and continues to terminal replay tick `1287`; the same-length neutral replay does not complete. This distinguishes player-driven completion from environmental self-propulsion.

Snapshots expose level identity, the completion latch, launch membership, and exact per-tick steam/launch markers. Host presentation emits launch and finish events only from those exact markers. Events are not replay or fingerprint evidence.

## Fingerprint and compatibility

Foundation v1 authoritative bytes remain byte-for-byte unchanged, retaining golden `4f677949`. Level v2 appends a tagged `KLV2` authoritative-state sub-envelope binding level identity, first completion tick, and every launch-zone membership bit; Rapier snapshot continues to bind kinematic/physics transforms.

The current frozen Kitchen witness has terminal fingerprint `24f443e7` at replay tick `1287`. This Kitchen fingerprint is evidence for the current committed Kitchen definition, not a compatibility promise for unreleased future authored Kitchen revisions.

| Contract | Decision | Consequence |
| --- | --- | --- |
| Level format | 1 + new 2 | Foundation v1 unchanged; Kitchen requires v2 |
| Simulation version | unchanged | Foundation behavior/identity remains compatible |
| Replay protocol | unchanged at 4 | Existing header already carries complete level/generator/ruleset identity |
| Fingerprint envelope | unchanged at 1 | Foundation golden unchanged; v2 uses tagged state extension |
| Authoritative state envelope | unchanged at 4 | legacy bytes preserved; v2 sub-schema is explicitly tagged `KLV2` and versioned independently at 1 |
| Worker protocol | 4 -> 5 | initialization now proves level id/version/format/hash |
| Ruleset | unchanged at v1/hash | score quantization/ranking rules are unchanged |

## Deferred

Renderer, camera, art/assets, audio/VFX implementation, hazards/checkpoints, procedural generation, APIs, database provisioning, ghosts, leaderboard service, and production Daily publication are outside this PR.
