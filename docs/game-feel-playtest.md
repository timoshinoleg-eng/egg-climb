# Game Feel Lab — human playtest matrix

This is a small controlled comparison of the eight versioned feel presets. It is
not a content test and does not seek to prove a universal winner.

## Session protocol

Use the same short task course for every condition: (1) move to a marked platform,
(2) jump across a fixed gap, (3) recover from one angled landing, and (4) repeat
the gap three times. Keep camera, level geometry, physics-v1, seed, display size,
and control labels constant. The client shows only the plain control surface and
feedback needed to understand the current action; diagnostics are exported after
the run rather than used to coach the participant.

Each participant completes one warm-up, then three scored attempts per preset.
Discard only a run with a technical fault, recording the fault and replacement
attempt. Do not restart because of a miss. The facilitator does not name a preset
or describe it as assisted.

## Counterbalanced order

Use a Latin-square order over eight conditions. Assign participant `p` to row
`p mod 8`; reverse the row for every second block. Keep the baseline
`3d-tap-raw-v1` as the first scored condition for the first half of participants
and as the final scored condition for the second half. This gives a baseline
anchor without making baseline-first the universal order. Within a condition, the
three attempts are consecutive and use the same seed.

| block | order rule |
| --- | --- |
| A | Latin-square row, baseline first when assigned to an even row |
| B | reverse Latin-square row, baseline last when assigned to an odd row |

The exported manifest must contain the actual order; the planned order is never
reconstructed from participant id after the fact.

## Per-attempt capture

Record the raw tick input file and diagnostic telemetry for each attempt. Capture
completion, falls, retries, time to finish, jump-down and release ticks, apex and
landing ticks, buffer/coyote use, contactT at launch/landing, and the exact preset
and physics identities. A short post-condition questionnaire uses 1–7 ratings:

| measure | prompt |
| --- | --- |
| control | “I could make the egg do what I intended.” |
| timing | “Jump timing felt predictable.” |
| recovery | “Recovering from a bad landing felt fair.” |
| effort | “The control scheme required reasonable effort.” |
| confidence | “I would choose this control setup for the next attempt.” |

Ask one open question: “What moment felt most satisfying or frustrating, and why?”
Collect no identifying data in the game export; keep consent and participant
mapping in the separate study log.

## Analysis plan

Summarize each preset with attempt-level completion/fall metrics and the median of
each rating, retaining participant-level rows. Analyze condition differences with
participant as the repeated unit and report uncertainty and missing runs. Inspect
comments alongside telemetry to explain effects such as a helpful coyote window,
an overlong hold, or tip assistance masking a poor landing.

Do not pool three attempts as independent people, do not infer preference from
scripted trajectories, and do not call a preset a winner from mechanics-only
tests. A candidate is ready for a next design pass only when the observed effect is
clear in ratings or behavior, the raw exports are complete, and no parity or replay
identity gate is failing.

## Operator checklist

- [ ] Confirm browser, viewport, input device, seed, and physics-v1 identity.
- [ ] Load the assigned order and verify the displayed preset label is neutral.
- [ ] Run warm-up, then three attempts per condition without changing the course.
- [ ] Export raw tick inputs, telemetry, ratings, comments, and actual order.
- [ ] Log technical faults and replacement attempts explicitly.
- [ ] Preserve the export with the preset and physics hashes before analysis.
