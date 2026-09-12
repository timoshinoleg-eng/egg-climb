# Kitchen Escape — игровой экран и проверка

Дата: 10 сентября 2026. Дополнение к предыдущей поставке Cloud Garden.

## Что реализовано

- Отдельный игровой экран **Kitchen Escape**, доступный через вкладку мира,
  `/play/kitchen.html` или `/?mode=kitchen`. Cloud Garden и лаборатория сохранены.
- Канонические `KITCHEN_LEVEL`, `PHYSICS_V1`, `DEFAULT_FEEL`; нет подмены geometry,
  spawn, усиления прыжков или изменения авторитетной симуляции.
- Объёмная oblique-проекция 3D-координат через Canvas: стол, разделочная доска,
  столешница, тостер, холодильник, движущийся шкафчик, вытяжка и вентиляция.
- Исходные размеры/повороты платформ берутся из level definition; движение
  шкафчика интерполируется по physics ticks, а не по часам renderer.
- Пар показывает реальный `activeContinuousForceZoneIds`; POP и искры тостера
  запускаются по `launch` events. Выход завершается только по настоящему Finish latch.
- Общий безопасный lifecycle, отдельный local best Kitchen, pause/help/restart,
  обзор кухни/камера за яйцом, Retina-aware canvas и reduced motion.
- Процедурные материалы и artwork, depth sorting, ограниченные частицы и labels;
  новых зависимостей и внешних ассетов/шрифтов нет.

Это Canvas-представление **трёхмерной физики**, не новая плоская физика и не полный
WebGL-renderer. Фоновый декор не создаёт невидимые дополнительные коллайдеры.
Score/best остаются локальными, хотя Finish — канонический.

## Управление

- **A / D** или **← / →** — вдоль столешницы.
- **W / S** или **↑ / ↓** — по глубине сцены.
- **Space / HOP** — прыжок; на остром конце он сильнее.
- **Escape / P** — пауза. Кнопка с четырьмя уголками переключает обзор/следование.
- На телефоне есть четыре направления и HOP; проверены размеры touch targets,
  portrait/landscape, отсутствие скролла и корректный DPR.

## Архитектура

- `src/game/kitchen-run.ts`: неизменные канонические настройки, локальные bounds,
  корректный начальный baseline бонуса, завершение по `completionTick`.
- `src/game/arcade-run.ts`: прежний bounded/epoch-safe lifecycle с явной политикой
  раунда; поведение Garden сохранено.
- `src/render/kitchen-scene.ts`: read-only геометрия, проекция и tick interpolation.
- `play/kitchen-view.js`, `kitchen-art.js`: отображение и процедурные материалы.
- `play/modes.js`: закрытый выбор двух режимов, раздельные storage keys, lazy views.
- `play/kitchen-worker.js`: Worker только с каноническими Kitchen options.

Подробное решение: [ADR 0006](../adr/0006-playable-kitchen.md).

## Локальная проверка

| Проверка | Результат |
| --- | --- |
| TypeScript build | PASS |
| Unit | **164 PASS**, 0 failed/skipped |
| Chromium: прежние сценарии Garden/MAX/packaging/determinism | **16 PASS** |
| Chromium: новые Kitchen UI сценарии | **5 PASS** |
| Статический пакет под `/egg-climb/` | Garden + MAX + Kitchen PASS |
| Foundation fingerprint | `4f677949`, без изменений |
| Kitchen witness | `24f443e7` на terminal tick 1287, без изменений |

Новое browser-покрытие проходит через настоящие клавиатурные события и UI:
3D steering, tick-driven cabinet, toaster, Finish, pause/restart, отдельные best,
навигация с teardown Worker, mobile orientation и reduced motion.

Для длинных маршрутов используется управляемый Playwright clock и **read-only**
наблюдение за Worker. Все реально отправленные inputs сравниваются с ожидаемыми.
Ни телепортации, ни изменения ответов Worker, ни setter-API для score/Finish нет.

Маршрут к Finish завершается на тике **1167**. Он пролетает выше steam AABB,
поэтому пар проверяется **второй клавиатурной траекторией**, которая входит в него
на тике **901**. Проверяется не только сигнал, но и LIFTING-индикатор и его сброс.

Матрица Playwright теперь регистрирует **63 сценария** на трёх движках. Восемь
прежних исключений диагностического WebGL UI не изменены; новые Kitchen-сценарии
не отключены ни в одном проекте.

## FPS: отдельный real-time smoke

```bash
npm run debug:serve
# В другом терминале:
npm run test:perf:kitchen
npm run test:perf
```

Методика исключает начальный неполный rAF-интервал, проверяет `phase=playing`,
продвижение tick-телеметрии и отсутствие backlog. Это не clock-mocked e2e.

Chromium 152.0.7977.0, viewport 390×844, device DPR 2:

| Метрика | Kitchen, полный обзор | Garden |
| --- | --- | --- |
| Средний FPS | **60.00** | **60.00** |
| Frame p95 | 16.80 ms | 16.70 ms |
| Frame max | 16.80 ms | 16.80 ms |
| Render-work p95 | **0.60 ms** | **0.50 ms** |
| Интервал | 6016.4 ms / 361 frames | 6016.3 ms / 361 frames |
| Кадров >20 ms | 0 | 0 |
| Queue / browser errors | 0 / 0 | 0 / 0 |
| Adaptive quality / effective DPR | **low / 1.0** | medium / 1.5 |

Kitchen прошла этот конкретный smoke с адаптивным снижением Canvas-разрешения:
**60 FPS при native DPR 2 не заявляются**. HUD остаётся обычным DOM. Для физического
Android/iOS/MAX, энергосбережения и других GPU нужна отдельная проверка.

## Доставка и восстановление истории

11 сентября 2026 доступ к GitHub API и Git-транспорту восстановлен. Пользователь
разрешил завершить доставку и выполнить push. Публикация производится только в
`arena/01a087f3-egg-climb`; main и production deployment не изменяются.

Во время прежней блокировки (401/422) новый Kitchen UI оставался только локально.
После восстановления среды Git-история была доступна лишь до исходной базы,
поэтому все актуальные файлы были сохранены в отдельном snapshot `062e5a5` и
проверенном архиве `egg-climb-kitchen-complete.zip`. Архив содержит 143 исходных
файла, полный Git-bundle snapshot, SHA-256 manifest и инструкции восстановления;
токены, `.env`, credential-файлы и node_modules исключены.

Для нормального push без переписывания истории Kitchen-дельта повторно наложена
на опубликованный `418e93a`. Перед этим побайтово проверено соответствие исходников
архиву; файлы симуляции, host transport и исходный Kitchen witness не изменены.
Резервный snapshot не force-push-ится поверх удалённой ветки.

Build и **164 unit-теста** повторно прошли после восстановления. Предыдущие локальные
**21 Chromium-сценарий** и real-time FPS smoke относятся к тем же исходникам.
Полная актуальная матрица проверяется в GitHub Actions и отслеживается в
[PR #13 Checks](https://github.com/timoshinoleg-eng/egg-climb/pull/13/checks).
Старый зелёный CI для `418e93a` не считается проверкой нового Kitchen UI.

PR: https://github.com/timoshinoleg-eng/egg-climb/pull/13.
Слияние PR и production deployment остаются отдельным решением владельца.

## Актуальное дополнение: MAX performance profile

После реального теста в MAX стало ясно, что исходный desktop/mobile smoke не гарантировал приемлемую скорость внутри MAX WebView. Production MAX entry теперь `max.html`, а constrained/coarse-touch Kitchen использует отдельный presentation profile: LOW, DPR 1, reduced decorative motion, без тяжёлых текстур/частиц и с render stride 2. Авторитетная 60 Hz Worker-симуляция при этом не меняется.

Телеметрия различает browser rAF cadence и фактически отрисованные presentation frames. При stride 2 около 60 Hz rAF и около 30 presentation FPS являются ожидаемой парой, а не «60 FPS Kitchen». Реальный Android/iOS MAX playtest остаётся обязательным acceptance gate.
