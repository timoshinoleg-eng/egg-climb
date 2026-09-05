# Game Feel Lab — versioned feel presets

Status: accepted design for the next playtest stage. This layer is deliberately
independent from the frozen `physics-v1` preset and must not change the collider,
mass properties, support classification, or physics preset hash.

## Decision

Expose one immutable, versioned `FeelPreset` identity through the same simulation
options used by local and worker hosts. The preset is part of replay metadata and
the authoritative fingerprint. A replay must fail closed if its feel id, version,
or hash is unavailable or different. The default remains the `3d-tap` preset
(`version: 1`, no assist), so an existing physics-v1 run keeps its baseline
behavior when no feel option is given.

The initial matrix is the Cartesian product of these controlled factors:

| axis | values |
| --- | --- |
| movement space | `2.5d`, `3d` (`2d` in user-facing copy) |
| jump gesture | `tap`, `hold-release` (`hold` in user-facing copy) |
| assistance | `raw`, `assist` |

This yields eight explicit keys: `2d-tap`, `2d-tap-assist`, `2d-hold`,
`2d-hold-assist`, and the four corresponding `3d` keys. Each object carries an
explicit `version` field; the version is part of its canonical hash and replay
identity. `3d-tap` is the baseline and is never silently replaced by a new default.

Presets use the following initial constants:

- assisted input buffer: 6 simulation ticks; raw: 0;
- assisted coyote time: 4 simulation ticks after leaving support; raw: 0;
- hold-release charge: 30 ticks maximum; tap has no charge;
- hold-release jump scale: `0.55..1.0`, monotonic with held charge; tap: 1;
- tip-hold assist: only in `assist` variants, damping angular velocity by
  `0.012 * contactT²` per eligible held tick, capped by the versioned preset;
- damping is applied only while the hold is active and the egg is supported;
- `raw` variants do not apply tip assistance, input rewriting, or main-thread
  correction.

The hold gesture must produce a measurable short-versus-long trajectory difference
in the real simulation. A test that merely checks a stored option or a UI label is
insufficient. Release is an input edge and must be serialized tick-exactly.

## Why presets

Bundled immutable presets make the experiment reproducible: every run has a compact
identity, a stable hash, and an unambiguous replay contract. A mutable bag of flags
would allow combinations that were never playtested and would make telemetry and
replay comparisons ambiguous. Main-thread aids would make feel depend on render
cadence, frame throttling, or a browser-specific input path; they also hide the
actual simulation behavior from worker and Node parity tests. The only acceptable
presentation work is feedback that reflects authoritative diagnostics.

This stage does not add production levels, an SDK adapter, audio, network services,
or a claim that any variant is the better game. It is a controlled laboratory with a
plain client, touch buttons, diagnostic telemetry, and exported tick inputs.

## Measurement rules

Every finalized run exports runtime/physics/feel/collider identities, scenario, exact raw tick inputs and final fingerprint. Completed attempts include approximate launch/apex/landing ticks, apex height, landing position, accepted jump source and strength. Explicit ratings and notes remain attached to their own run. ContactT, grounded and current charge are live diagnostics; they are not a per-tick telemetry export. Reset/variant changes preserve separate finalized runs. Node replay reconstructs authoritative state from the raw inputs.

The scripted suite verifies mechanics and transport parity only. It must not report
a human preference winner. Human playtests use the protocol in
`docs/game-feel-playtest.md`; conclusions are made from the recorded ratings and
comments, with order counterbalanced across participants.

## Compatibility gate

Before a preset is considered usable, Node local simulation, browser worker, and
browser reset/chunked execution must match for all eight identities. The 2.5D mode
must constrain Z translation and X/Y rotation in the simulation, rather than merely
hide those axes in the client. The 3D mode must permit the corresponding motion.
Short and long holds must be tested on actual jump trajectories, and the default
baseline must be checked first in the ordering test.
