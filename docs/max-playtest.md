# MAX playtest deployment

`npm run package:playtest` creates the isolated static site in `build/playtest`. Only runtime JS, the baked renderer/worker, Three and pinned deterministic Rapier with license notices are published. Sources, tests, maps and repository files are excluded. All imports work beneath a URL prefix.

GitHub Pages publishes after successful main CI. The MAX launch URL is `https://timoshinoleg-eng.github.io/egg-climb/?max=1&feel=3d-tap&scenario=jump-base&visual=plain&order=0`.

In MAX Partner Cabinet, create/select the dedicated Egg Climb bot, open Advanced settings, set this HTTPS Mini App URL and the Play button. Keep other game bots unchanged. The resulting `https://max.ru/<actual-bot-name>?startapp` link opens the configured app. The bot's actual assigned name must come from the cabinet, not be invented.

The opt-in `max=1` shell hides diagnostics behind buttons and keeps touch controls visible. Export opens a selectable/copyable local JSON record rather than depending on WebView Blob downloads. Reproduce saved records with `npm run replay:playtest -- record.json`. No user IDs, initData, access tokens or account data are collected. No bot polling or messaging is needed for launching the Mini App.

The official MAX Bridge is loaded asynchronously only in MAX mode from https://st.max.ru/js/max-web-app.js; the game works if it fails. This is the host platform bridge, not a simulation dependency. It is not vendored or added to npm. Main-thread UI reads only the platform label; authoritative physics has no bridge/DOM dependency. See https://dev.max.ru/docs/webapps/bridge and https://dev.max.ru/docs/webapps/introduction.

Real-device checklist: Android and iOS MAX launch, first frame, sustained steering/jump, hold-release, cancellation on background, portrait/landscape and keyboard with notes, reset, switching feel, saving ratings and copying export. Record actual MAX/device versions and subjective issues. Desktop Chromium mobile emulation and Playwright WebKit are not real MAX device results.
