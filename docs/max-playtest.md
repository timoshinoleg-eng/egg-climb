# MAX playtest deployment

`npm run package:playtest` creates the isolated static site in `build/playtest`. Only runtime JS, the baked renderer/worker, Three and pinned deterministic Rapier with license notices are published. Sources, tests, maps and repository files are excluded. All imports work beneath a URL prefix.

GitHub Pages publishes after successful `main` CI. The canonical MAX Mini App entry is:

`https://timoshinoleg-eng.github.io/egg-climb/max.html`

`max.html` removes stale Lab query parameters, adds `max=1` and routes to `play/kitchen.html`. The packaged root behaves the same for a normal MAX launch. The local debug server mirrors this routing. Physics/Game Feel Lab is available in MAX only by an explicit `lab=1` diagnostic URL; old `feel`, `physics`, `scenario`, `visual` or `order` parameters alone must not reopen the Lab.

In MAX Partner Cabinet, create/select the dedicated Egg Climb bot, open Advanced settings, set the HTTPS Mini App URL above and the Play button. Keep other game bots unchanged. The resulting `https://max.ru/<actual-bot-name>?startapp` link opens the configured app. The bot's actual assigned name must come from the cabinet, not be invented.

Kitchen currently runs as a local gameplay playtest inside MAX. Its canonical physics remains fixed at 60 Hz in a Worker. On constrained/coarse-touch launches the presentation selects `KitchenMaxView`: LOW quality, DPR 1, reduced decorative motion and render stride 2. The renderer may therefore present about 30 visual frames per second while browser rAF cadence remains near 60 Hz. Telemetry reports those two rates separately; do not report rAF Hz as presentation FPS.

The constrained profile locks reduced-motion presentation for performance. Physics, input sampling, replay identity and authoritative Finish are not reduced. Current score/personal best remain device-local.

The old Lab shell still supports local JSON export for diagnostics. Reproduce saved Lab records with `npm run replay:playtest -- record.json`. No production MAX user identity, initData authentication, online run submission or leaderboard is implemented by the playable Kitchen client yet; the strict server-side initData validator is contract foundation only.

Real-device checklist: Android/iOS MAX launch, Kitchen + Practice first frame, sustained steering/jump, input latency, background/resume, portrait/landscape, restart, camera readability and sustained performance. Record actual device/OS/MAX versions. Desktop Chromium mobile emulation and Playwright WebKit are portability evidence, not physical MAX certification.
