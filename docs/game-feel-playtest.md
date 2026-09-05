# Game Feel Lab — playtest protocol

The lab compares eight explicit variants, not a final game mode. Default is `3d-tap` with no assistance. Keyboard and pointer controls are available. No human ratings have been collected by the automated tests.

## Run

Start `npm run debug:serve` and open `http://127.0.0.1:4173/?feel=3d-tap&scenario=jump-base&visual=plain&order=0`.

Use the same three existing fixtures in each condition:

1. `jump-base`: make three controlled launches and observe landing recovery.
2. `jump-side`: use torque, launch, and try to recover without leaving the platform.
3. `slope-contact`: steer and launch on the incline; record unintended drift or missed inputs.

Use arrows/WASD or pointer buttons. TAP launches on down. HOLD_RELEASE charges for up to 30 ticks (half a second) and launches on release; blur/cancel discards the charge. Reset starts a fresh run. A completed attempt is an accepted jump followed by a landing; a fall or abandoned attempt remains visible in raw inputs/notes rather than falsely counted as a landing.

The UI reports up to three completed attempts per run. Trajectory/apex/landing observations are sampled at worker batch boundaries and are approximate. Raw tick inputs and the final fingerprint are exact. There are no completion/fall leaderboards or production course claims.

## Order and controls

Keep physics-v1, fixture, viewport, device and visual preset fixed while comparing feel. The eight keys are `3d-tap`, `2d-tap`, `3d-hold`, `2d-hold`, then the same four with `-assist`.

Choose an anonymous order row 0–7. The balanced order uses base indices `[0,1,7,2,6,3,5,4]`, shifted by the row modulo eight. Next variant follows that order. Export records the planned order and separately preserves actual run history. This counterbalances ordering; it does not force baseline first for everyone. Do one unscored warm-up before recording comparisons.

After each condition, record the implemented 1–5 ratings: clarity, control, fun, and a short note. Describe missed release timing, unwanted lateral drift, helpful buffering or assistance that felt excessive. Do not treat an initial rating value as a submitted vote: Save rating is explicit.

Compare `plain` and `feedback` separately after selecting candidate control modes; changing both feel and visuals in the same comparison confounds the result. The UI displays developer preset labels and diagnostics, so this is an open development playtest, not a blinded study.

## Export and reproduce

Export JSON pauses sampling and drains queued/in-flight worker ticks before capturing identity and fingerprint. Changing variants or resetting archives the previous finalized run separately; ratings from different presets must not be merged into one run. The bounded local history preserves up to 24 runs; export a file before starting a larger block.

Run `npm run replay:playtest -- path/to/export.json` to validate contiguous ticks, runtime/physics/feel/collider identity and the final fingerprint of the current and archived runs. Reports remain local; no backend or user account is required. Do not place personal identifiers in notes.

Summarize ratings per participant/condition and read notes alongside accepted jump sources, raw inputs and approximate trajectories. Do not pool three attempts as three independent people. Mechanical tests establish correctness and portability, not preference. Record the actual people/devices tested before choosing 2.5D/3D, TAP/HOLD_RELEASE or assist defaults.
