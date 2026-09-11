# Kitchen Escape — World 01 human playtest protocol

## Purpose

This protocol validates the product presentation of the committed Kitchen Escape level. It does **not** validate authoritative physics, replay, scoring or Daily leaderboard contracts; those remain covered by deterministic tests.

The current product question is narrower: does a first-time player understand the fantasy, read the route and mechanics, and want to retry without coaching?

## Current presentation risks found before human testing

The code audit identified two specific readability risks:

1. the follow camera used one global framing rule across the entire route, so later vertical landmarks were not deliberately anticipated;
2. on viewports at or below 620 px the desktop route card is hidden, leaving no persistent next-objective cue during play.

The camera/readability change under test addresses only those two presentation issues. It adds route-authored camera regions and an in-canvas next-objective cue. Simulation snapshots, canonical Kitchen identity, collision, Finish and score remain unchanged.

## Participants

Use 5–10 first-time players. Prefer the target age range when available; otherwise include people who regularly play short mobile games.

Do not count developers or anyone who has already seen the Kitchen route as a first-time participant.

Recommended device mix:

- at least 3 smartphone sessions;
- at least 1 narrow/short viewport session;
- at least 1 desktop session for comparison.

For MAX release confidence, repeat the final pass inside the real MAX WebView on at least one Android device and one iPhone if available.

## Test setup

Start from the default root, which must open Kitchen Escape. Clear local best-score storage before each first run when practical.

For the first 60 seconds:

- do not explain the route;
- do not explain toaster, steam or moving cabinet behavior;
- do not point at controls unless the player is completely blocked by input discovery;
- do not tell the player where the vent is.

After the first attempt, normal questions are allowed.

## Observer script

Record these items without coaching:

1. **Fantasy recognition** — ask after 10 seconds: “What do you think is happening here?”
2. **Goal recognition** — ask: “Where are you trying to get?”
3. **Next landing readability** — before a difficult jump, note whether the player can identify the intended landing without guessing.
4. **Toaster comprehension** — did the player understand that entry causes a pop and that leaving re-arms it?
5. **Steam comprehension** — did the player recognize the steam as a lift rather than decoration?
6. **Moving cabinet comprehension** — did the player wait/time the moving surface intentionally?
7. **Camera-caused errors** — mark a death if the player says or clearly demonstrates that the target was hidden, moved unexpectedly or became unreadable because of framing.
8. **Control confusion** — record any mistaken interpretation of left/right versus depth controls.
9. **Retry friction** — measure whether the player immediately understands how to retry.
10. **Voluntary retry** — after the first attempt, do not ask for another run; record whether the player starts one on their own.

## Per-player scorecard

Record:

- device / viewport;
- fantasy understood within 10 seconds: yes/no;
- vent/escape goal understood without coaching: yes/no;
- toaster understood: yes/no;
- steam understood: yes/no;
- moving cabinet understood: yes/no;
- first-attempt duration;
- first completion achieved: yes/no;
- number of camera/occlusion-caused deaths;
- number of “can I go/jump there?” route-readability questions;
- retry found without coaching: yes/no;
- voluntary retry: yes/no;
- short verbatim comment: “What felt confusing or unfair?”

Do not convert observer guesses into player quotes.

## Acceptance gate

Treat the graybox as ready for the next visual pass when the small sample shows all of the following:

- most players understand “tiny egg escaping a giant kitchen” within about 10 seconds;
- most players identify the vent/escape direction without being told;
- intended landings are normally visible before commitment;
- camera/occlusion-caused deaths are rare and below roughly 10–15% of observed deaths;
- toaster, steam and moving cabinet are understood by most players after encountering them once or twice;
- retry is immediate and obvious;
- at least half of the sample voluntarily starts another attempt after the first run.

These are product gates for an early sample, not statistical claims.

## Red flags

Stop visual polish and fix readability first if any of these repeat across participants:

- “Where am I supposed to go?” after the opening section;
- recurring “Can I jump there?” questions;
- the egg or landing target repeatedly leaves useful framing;
- players interpret steam as decoration;
- players do not notice cabinet motion until collision/failure;
- the next-objective cue is read as a button or authoritative navigation path;
- players complete a run but do not understand why the toaster/steam worked;
- retry requires explanation.

## What not to conclude from this test

This protocol cannot prove:

- production retention or D1/D7;
- network/backend reliability;
- leaderboard fairness;
- MAX WebView performance on devices that were not tested;
- final art quality;
- accessibility completeness.

Human observations should be recorded separately from deterministic CI evidence.
