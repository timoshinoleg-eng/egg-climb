# ADR 0004 — Game Feel Lab

Status: implemented for comparative playtesting; no human-tested winner selected.

The physics-v1 collider, mass properties and continuous contact jump curve remain unchanged. A separate immutable FeelPreset identifies 2.5D/3D, TAP/HOLD_RELEASE and assists. Eight named presets form a small factorial matrix. The default `3d-tap` keeps assists off.

2.5D projects initial rotation/velocity into the XY plane and locks Z translation plus X/Y rotation in Rapier. The initial Z coordinate defines the plane. It is not a render-side constraint. Both modes retain the same 60 Hz simulation in the worker/Local host.

Hold-release scales the contact-derived impulse from .55 to 1 over 30 ticks. A same-tick down/up is a minimum-charge release; release at tick 30 after down at tick 0 is full charge. Holding does not jump. Cancel has priority and drops pending charge/buffer without a release impulse.

Assisted presets use a six-tick input buffer and four airborne ticks of coyote time. Both expiry boundaries are inclusive. Buffer stores the accepted intent's charge scale and uses the real landing contact; coyote uses the last actual supported contact's continuous contactT and normal. Coyote never sets grounded=true. The jump consumption latch prevents another impulse until separation and a new landing.

Tip-hold applies a bounded angular damping impulse while held and supported: `-angularVelocity * .012 * contactT²`, for at most eight supported held ticks. It adds no angular target or orientation-based jump quality. Assist values are initial playtest candidates, not a claim of optimal feel.

Replay protocol and worker protocol are version 3; simulation is `sim-feel-lab-v1`, authoritative state version 4. Feel id/version/hash are checked fail-closed in replay, worker handshake and snapshot identity. Held state, consumption latch, buffered scale/deadline, charge, coyote and cached contact are canonically serialized. Debug-only last-jump labels/telemetry do not affect the fingerprint.

The new candidate golden is `4f677949`; it must be observed across the three Node platforms and three browser engines before replacing the prior `ec643eb8` golden. The fingerprint change follows the intentional simulation/state/version contract update.

The debug UI offers plain/feedback visual presets, keyboard and pointer controls, charge feedback, three-attempt observations and player ratings. Visual effects and wall-clock session labels are main-thread diagnostics only. Raw input samples use monotonically increasing authoritative tick numbers. Export pauses sampling, drains worker transport and binds a final fingerprint; `npm run replay:playtest -- export.json` verifies it in Node. Trajectory/apex observations from transport batches are explicitly approximate; scripted apex tests sample every tick.

No runtime dependency is added. No production level, final 2.5D/3D decision, audio, haptics, platform SDK or backend is included. Human playtest order and scoring are in `docs/game-feel-playtest.md`.
