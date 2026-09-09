# Engineering & Visual Delivery Report: Egg Climb

**Дата:** 10 сентября 2026 · **Режим:** local arcade practice + сохранённая Physics/Game Feel Lab.

## 1. Executive Summary

**До:** детерминированная Rapier/Worker-основа с лабораторным Three.js-интерфейсом,
95 unit-тестами и отдельным демонстрационным juice-renderer. Основного аркадного
цикла с onboarding, счётом, Game Over и in-place restart не было.

**После:** играбельный **Cloud Garden** — подъём к отметке 15 м, отзывчивое
клавиатурное/мультитач-управление, аркадный HUD, эффекты и безопасный lifecycle.
Canvas 2D только отображает planar Rapier-позы; отдельной физики в renderer нет.
Лаборатория и MAX-экспорт по-прежнему доступны через `/debug/index.html`.

- **PR:** https://github.com/timoshinoleg-eng/egg-climb/pull/13 — ready for review.
- **Ветка:** `arena/01a087f3-egg-climb`, закреплённая за Arena-сессией.
- **Baseline SHA:** `ec520776c2ca186bd10d3959d723670ee7e30856`.
- **Runtime-код основной поставки:** `58dbadba996bbed1ce4df04b91cfe591b59cceca`.
- **Полный CI:** https://github.com/timoshinoleg-eng/egg-climb/actions/runs/34407859412 — SUCCESS.
- **Коммиты:** `a9719e3` — core; `c4f1b9a` — visuals; `58dbadb` — tests.
- Новых production/dev-зависимостей и скачанных art-паков в проект не добавлено.
  Геометрия, фон, персонаж и SVG-марка созданы в коде.
- Main не изменялась; PR не слит, production deployment не выполнялся.

Репозиторий уже был клонирован средой: повторный `git clone ... .` в непустой
checkout не выполнялся. Node 22.22.3 соответствует `.nvmrc`. Подробности baseline
сохранены в [baseline.md](./baseline.md).

## 2. Устранённые дефекты (P0–P1)

P0 не обнаружены. Исправления P1 и отсутствовавшего игрового lifecycle:

| Дефект / риск | Исправление и проверка |
| --- | --- |
| `localStorage.setItem` прерывал reset/навигацию при quota/private-mode ошибке | `SafeStorage` защищает даже получение объекта storage, JSON-разбор и запись; проверяет тип/размер. Игру можно продолжать без persistence. Unit + полный browser round при запрещённом storage. |
| Неотвечающий Worker мог навсегда оставить UI/export в ожидании | 10-секундный watchdog каждого запроса, очистка таймеров, обработка синхронного `postMessage`-сбоя, синхронный `terminate()`. Browser-тест намеренно зависшего Worker и восстановления через Reload. |
| `NaN` delta отравляла accumulator; старые input-сэмплы переживали pause | Невалидная delta не принимается; backlog ограничен; отдельные `discardPending()` и полный `reset()`. Накопленный wall-clock долг не превращается в незафиксированные тики. |
| Старые async-ответы могли загрязнить новый раунд | Epoch fence, один in-flight tick, объединение повторного restart, сброс previous/current, score, combo, очередей и телеметрии. Проверены delayed response и двойной restart. |
| Pointer не имел независимого владения jump | Владение по pointer ID / keyboard source; один палец не отпускает другой. Blur/visibility/cancel не генерируют случайный hold-release jump. |
| rAF и presentation timeout продолжали жить после ухода | Один владелец rAF, отмена при restart/pause/pagehide, затухание terminal VFX без `setTimeout`, освобождение Worker и GPU-ресурсов лаборатории. Browser-проба подтверждает максимум один rAF и ноль Worker после teardown. |
| Яйцо могло бесконечно падать за пределами игрового пространства | Local Game Over по bounds, восстановление через restart; локальный раунд ограничен 180 секундами активных physics ticks. |
| Torque-only planar steering практически не перемещал яйцо | Отдельный `arcade-physics-v1` с фиксированным боковым импульсом и явным hash-полем. Реальный Rapier-тест поднимается на первую платформу без teleport/test API. |
| Публичный debug-server раздавал checkout, включая `.git` и потенциальный `.env` | Allowlist runtime-ресурсов, проверка realpath/symlink, запрет source/SQL/server JS, `nosniff`, безопасные GET/HEAD. Preview слушает `0.0.0.0`. |

**AppSec:** динамические значения попадают в `textContent`/`value`, а не в HTML
sinks. Реальных `.env`/секретов среди коммитов нет; добавлены ignore-правила.
`db/` — SQL foundation, а не сетевой DB-клиент: gameplay не зависит от доступности
базы. Это не утверждение о проведённом pentest будущего production backend.

**Совместимость:** старые preset hashes и golden fingerprints не менялись.
Новый drive включён только в arcade preset и входит в его identity. Лабораторные
параметры не подменены. Аркадный score, local best и summit **не являются**
серверно подтверждёнными Daily/leaderboard-результатами; для такого режима нужен
отдельный acceptance/ruleset review. См. [ADR 0005](../adr/0005-local-arcade-shell.md).

## 3. Детализация визуального апгрейда

- **Squash & stretch:** ограниченная spring-интеграция; отталкивание растягивает,
  приземление сжимает; горизонтальная компенсация сохраняет объём силуэта.
- **Screen shake:** кратковременные импульсы на удар/падение, без накопления
  смещения в базовой камере и без влияния на физику.
- **Particle system:** фиксированный пул **128** частиц — пыль при толчке/landing,
  фрагменты скорлупы при падении, золотые искры при combo/рекорде.
- **Floating numbers:** шесть переиспользуемых слотов для `+50`, `NICE LANDING`,
  `GREAT!`; нет бесконечно растущего DOM/массива эффектов.
- **Камера:** интерполированные snapshots и экспоненциальный вертикальный lerp,
  независимый от частоты рендера.
- **Canvas/Retina:** размеры связаны с devicePixelRatio; quality tiers ограничивают
  effective DPR до 2 / 1.5 / 1. Дорогой статический фон и спрайт кэшируются.
- **HUD/UI:** контрастные высота, очки и best; карта milestones; onboarding;
  Game Over с анимацией рекорда и явным restart; pause/help; safe-area и touch targets.
- **Доступность:** клавиатура, семантические кнопки/dialog, focus management,
  пользовательский reduced-motion toggle и системный `prefers-reduced-motion`.

Счёт local practice: **10 очков за каждые 10 см максимального COM-подъёма**, плюс
10–50 bonus points за действительно более высокое приземление. Повторные прыжки
на той же платформе не позволяют накапливать combo-бонус.

## 4. Результаты тестовых прогонов

| Проверка | Результат |
| --- | --- |
| `npm ci`, Node 22 | PASS |
| `npm run build` / strict TypeScript | PASS |
| `npm test` локально | **134 PASS**, 0 failed/skipped; было 95 |
| AST determinism + существующие golden/replay проверки | PASS; ожидаемые fingerprints не переписаны |
| Chromium Playwright локально | **15 PASS** |
| Node CI: Linux x64 / Windows x64 / macOS arm64 | **PASS / PASS / PASS** |
| Полный browser CI: pinned Chromium / Firefox / WebKit | **PASS** |
| Static package: lab/MAX + arcade под `/egg-climb/` | PASS |
| `npm audit --audit-level=high` | **0 vulnerabilities** |
| 60 Hz mobile-viewport smoke | **PASS** — показатели ниже |

Матрица регистрирует **45 browser cases**; восемь прежних исключений
диагностического WebGL UI на Firefox/WebKit сохранены. Семь новых аркадных
сценариев зарегистрированы для каждого из трёх движков, без новых skip.
CI-статус подтверждён через Jobs/Checks API: все четыре job и install/typecheck/test
steps успешны. Архив подробных CI-логов из sandbox не скачивается, поэтому отдельный
числовой итог PASS/SKIP из этого архива здесь не выдумывается.

**История ограничения среды:** полная локальная команда
`npm run build && npm test && npx playwright test` действительно запускалась.
Firefox/WebKit не стартовали из-за отсутствующих бинарников и недоступности CDN/
Debian mirrors. После обсуждения пользователь попросил продолжить через draft PR
и GitHub Actions. Там браузеры установились и полный CI прошёл; только после этого
PR переведён в ready for review. Локальный environment failure не переименован в PASS.

### Дополнительный проход после поставки

Добавлены ещё две постоянные регрессии без изменения runtime-кода и баланса:

- **100 быстрых рестартов** с очередью управления и одновременными запросами:
  точное восстановление snapshots/fingerprint, нулевой score/combo, пустая очередь.
- **Все 9 платформ Cloud Garden** пройдены реальными inputs. Для каждой требуется
  не менее 12 последовательных тиков устойчивой опоры внутри платформы: касание
  ребра не считается доказательством проходимости. Повтор тех же inputs через
  `ArcadeRun` даёт `summit` на тике **1728** (28.8 секунды симуляции), **1900 очков**,
  combo **5**, bonus **350**. Телепортации и обхода collision logic нет.

Итого локально **134 unit PASS**. Текущая матрица расширенной ветки доступна в
[PR #13 Checks](https://github.com/timoshinoleg-eng/egg-climb/pull/13/checks).
Замеры FPS ниже относятся к исходной поставке, а не к новому физическому устройству.

### Измерение производительности

`npm run test:perf`, 390×844, device DPR 2, шесть секунд реальных повторных прыжков:

| Метрика | Измерено |
| --- | --- |
| Кадры / интервал | 361 / 6007.7 ms |
| Средний FPS | **60.09** |
| Frame p95 / max | **16.80 / 16.80 ms** |
| Кадров >20 ms | **0** |
| Main-thread render work p95 | **0.80 ms** |
| Quality / effective DPR | medium / 1.5 |
| Browser errors | 0 |

Локальный smoke выполнен на Chromium **152.0.7977.0**, временно установленном вне
репозитория через npm fallback; CI использует закреплённые Playwright-браузеры.
Это **эмуляция mobile viewport, не сертификация физического телефона**. Абсолютные
60 FPS на каждом GPU, iOS/MAX WebView и в энергосбережении не заявляются.
Методика/порог и воспроизводимые команды описаны в [verification.md](./verification.md)
и `scripts/measure-arcade.mjs`.

## 5. Шорт-лист Open-Source проектов и свободных ассетов

Лицензии сверены 10 сентября 2026 года: LICENSE исходных репозиториев для библиотек,
официальные страницы паков для Kenney. Это **рекомендации для следующей итерации**,
а не уже установленные зависимости. ZzFX и Howler — альтернативы: не нужно брать оба.

| Приоритет | Проект / лицензия | Практическая интеграция в Egg Climb |
| --- | --- | --- |
| 1 | **ZzFX — MIT**: небольшой генератор SFX, поддерживает предварительное создание звуков. [5](https://github.com/KilledByAPixel/ZzFX) | Короткие hop/landing/record cues из accepted presentation events. Предварительно сгенерировать 3–4 звука; запускать после user gesture; ограничить одновременные голоса. |
| 1, альтернатива | **Howler.js — MIT**: аудиобиблиотека с Web Audio, fallback и sound sprites. Лицензия подтверждена также в upstream `LICENSE.md`. [1](https://www.jsdelivr.com/package/npm/howler) | Если нужны готовые Kenney samples: один audio sprite, тихие short impacts, stop на restart, unload при teardown. Upstream: https://github.com/goldfire/howler.js. |
| 2 | **Kenney Impact Sounds — CC0**, официальный свободный sound pack. [1](https://kenney.nl/assets/impact-sounds) | Отобрать мягкое приземление, сухой shell crack и позитивный accent; нормализовать громкость и упаковать только выбранные файлы в локальный sprite. |
| 3 | **Kenney UI Pack — CC0**, кнопки, панели и элементы интерфейса. [1](https://kenney.nl/assets/ui-pack) | Использовать лишь нужные иконки/состояния кнопок для будущих экранов; сохранить палитру Cloud Garden. Для Canvas — небольшой atlas, а не сотни отдельных runtime images. |
| 3, опционально | **@tweenjs/tween.js — MIT**. [1](https://github.com/tweenjs/tween.js/blob/main/package.json) | Для усложнения result/HUD-анимаций использовать собственную Group в уже существующем rAF. `group.update(now)` и `group.removeAll()` описаны в upstream guide. [3](https://tweenjs.github.io/tween.js/docs/user_guide.html) |

У Tween.js автоматический SPDX-детектор GitHub возвращает `NOASSERTION`; сам
[LICENSE](https://github.com/tweenjs/tween.js/blob/main/LICENSE) проверен вручную:
MIT, включая copyright notice авторов и Robert Penner. При включении библиотек
нужно сохранить полный LICENSE/notice и обновить `THIRD_PARTY_NOTICES.md`. Для
CC0 рекомендую также хранить URL источника, исходный license-файл и версию/хеш
выбранного ассета, хотя это не повод объявлять весь сторонний сайт CC0.

### Примеры адаптеров для будущей интеграции

Псевдо-интеграция ZzFX после загрузки библиотеки и разрешённого user gesture:

```js
// Только downstream, после exactly-once presentation cursor.
for (const event of juiceFrame.events) {
  if (event.kind === 'jump' && !muted) zzfx(...jumpPreset)
}
// Не генерировать/декодировать длинные звуки внутри render loop.
```

Вариант с Howler и заранее подготовленным sprite (границы примерные):

```js
const cues = new Howl({
  src: ['./assets/sfx.ogg', './assets/sfx.mp3'],
  sprite: { jump: [0, 120], land: [180, 160], crack: [400, 250] },
  preload: false,
  volume: 0.2,
})
// В обработчике разрешённого пользовательского действия: cues.load()
// Accepted jump event: cues.play('jump')
// Restart: cues.stop(); полный teardown: cues.unload()
```

Tween.js для косметического счётчика, не для authoritative score:

```js
const group = new Group()
new Tween({ displayed: 0 }, group)
  .to({ displayed: finalScore }, 260)
  .onUpdate(value => { scoreNode.textContent = String(Math.round(value.displayed)) })
  .start()
// Существующий rAF: group.update(now)
// Restart/dispose: group.removeAll()
```

Эти фрагменты **не являются установленным/протестированным audio/tween feature**.
Текущий frontend — vanilla ESM без bundler: при интеграции нужно либо корректно
вендорить ESM/runtime-адаптер, либо явно добавить build step, расширить static
packager/allowlist и повторить subpath, autoplay, mute, teardown и FPS-тесты.

**Не рекомендую** добавлять второй physics engine поверх Rapier ради juice:
это дублирует уже работающий authoritative слой и усложняет replay-совместимость.
Для текущих простых UI-переходов CSS/существующих spring-примитивов достаточно.

## 6. Рекомендации по деплою (Vercel / GitHub Pages)

### Общий безопасный артефакт

```bash
npm ci
npm run package:playtest
# Публикуемый каталог: build/playtest
```

Публиковать **только** `build/playtest`, никогда checkout целиком. Секреты, SQL,
server JS, тесты, maps и `.env` в этот артефакт не входят. Runtime imports остаются
относительными; arcade и lab/MAX проверены под project subpath `/egg-climb/`.

### GitHub Pages — предпочтительно для текущего static playtest

1. После code review и зелёного CI слить PR обычным процессом владельца.
2. В Settings → Pages выбрать GitHub Actions, если это ещё не настроено.
3. Уже существующий `.github/workflows/pages.yml` публикует `build/playtest`
   после успешного CI на main. Из этой сессии merge/deploy не запускались.
4. Smoke опубликованной страницы: обычный root → arcade; `?max=1&feel=...`
   → lab/MAX; загрузка Worker/WASM; jump, export, restart и mobile orientation.

### Vercel — альтернативный static host

- Framework preset: **Other**, Node **22.x**.
- Install: `npm ci`.
- Build: `npm run package:playtest`.
- Output directory: `build/playtest`.
- Не добавлять catch-all SPA rewrite: здесь реальные HTML/JS/Worker-ресурсы.
- Проверить MIME `.js`, `.wasm` и `.svg`, HTTPS и отсутствие cross-origin
  запросов к localhost. Пока имена не content-hashed, не ставить immutable cache
  на HTML, worker и core JS — несовместимый cached Worker должен обновляться.
- Будущие DB/API credentials хранить только на серверной стороне платформы,
  никогда в клиентском `.env`/bundle. Текущей игре credentials не требуются.

### Перед production release

- Физические Android/iOS и MAX/WKWebView: 60 Hz pacing, нагрев, battery saver,
  background/foreground, rotation и многопальцевое управление.
- При добавлении backend: replay admission/resource limits, rate limiting,
  server-derived score, DB permissions и отдельный AppSec review.
- Проверить доступность интерфейса/контраст и пользовательские настройки в
  реальных assistive/browser environments, а не ограничиваться DOM smoke.
