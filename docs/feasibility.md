# Техническая реализуемость — этап 1

Дата исходного исследования: 2026-11-16. Этот отчёт фиксирует архитектурные выводы до реализации. Текущий объём первого этапа и выполненные runtime-проверки описаны в [README](../README.md), [API](api.md) и [validation](validation.md).

## Область доказательств

Проверен актуальный upstream `release`, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, package version **1.19.0**. Это целевой кандидат совместимости, а не подтверждение работы на всех 1.19.x. Версия hosted-инсталляции пользователя неизвестна. Официальная документация зафиксирована на `2148f90c413ab379185d869bee23c86caf8048a7`: [Writing Extensions](https://github.com/SillyTavern/SillyTavern-Docs/blob/2148f90c413ab379185d869bee23c86caf8048a7/For_Contributors/Writing-Extensions.md#L77), [установка из Git URL](https://github.com/SillyTavern/SillyTavern-Docs/blob/2148f90c413ab379185d869bee23c86caf8048a7/extensions/index.md#L308).

Исходники клонированы и прочитаны. Динамически проверена только последовательность обработчиков настоящего upstream EventEmitter (см. validation.md). На этапе исходного исследования полный браузерный pipeline, proxy GLM-5.3, установка на hosted-сервер и двухперсонажный E2E **не были проверены**. Позднее локальные проверки RPG Core выполнены отдельно, см. validation.md. Ниже порядок pipeline выведен из кода, а не выдан за наблюдённый лог. Этап 1 требует последующей проверки на целевой версии до заявления о runtime-совместимости.

## Проверенные по исходникам интерфейсы

| API | Назначение и ограничения | Источник |
| --- | --- | --- |
| `SillyTavern.getContext()` | Новый объект контекста; перечитывать после смены чата. `chat`, `chatMetadata`, `characters`, `groups`, `groupId`, `chatId`, `eventSource`, `eventTypes`, `extensionSettings` | [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/st-context.js#L115-L235) |
| `context.generate(type, options = {}, dryRun = false)` | Promise; `force_chid` — числовой индекс карточки, `signal` — AbortSignal; не постоянный actor ID | [Generate](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4264-L4365) |
| `context.stopGeneration()` | Останавливает streaming/controller, emits GENERATION_STOPPED; не откатывает уже написанное | [stopGeneration](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L5607-L5620) |
| manifest `generate_interceptor` | Имя `globalThis` async функции `(chat, contextSize, abort, type)`; `abort(true)` останавливает также проход остальных interceptors. Это не отмена всей очереди группы | [runner](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions.js#L2017-L2050), [место вызова](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4562-L4578) |
| `context.executeSlashCommandsWithOptions(text, options = {})` | Исполнитель STscript, а не безопасная конкатенация произвольного текста | [executor](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/slash-commands.js#L6988-L7035) |
| `/trigger await=true <member>` | Без await возвращает до окончания. Ждёт unlock до 10 секунд; при неразрешённом member может вызвать обычный выбор. Нельзя применять как fail-closed dispatch без предварительной проверки | [callback](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/slash-commands.js#L4987-L5021) |
| `/send` | Добавляет пользовательское сообщение без обычной генерации; пользовательский текст не должен повторно интерпретироваться как STscript | [callback](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/slash-commands.js#L5023-L5052) |
| `context.setExtensionPrompt(key,value,position,depth,scan=false,role=SYSTEM,filter=null)` | Сохраняет prompt injection; не очищает остальную историю, World Info и карточки | [definition](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L8926-L8938) |
| `context.chatMetadata`, `context.saveMetadata()` | Namespaced per-chat state; saveMetadata вызывает saveChatConditional, ошибки могут логироваться без rejection. Это не ACID-хранилище и не гарантия durable commit | [save](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L9408-L9440), [group serialization](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/group-chats.js#L623-L645) |
| `context.extensionSettings`, `context.saveSettingsDebounced()` | Настройки пользователя; не каноническое состояние кампании | [context](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/st-context.js#L130-L180) |
| `context.generateRaw(options)` | Явный prompt/systemPrompt/jsonSchema; кандидат для scoped classifier, проверить полный outgoing payload | [raw](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4000-L4128) |
| `context.generateQuietPrompt(options)` | Использует Generate('quiet'), значит текущий чат и group pipeline; не изолированный приватный classifier | [quiet](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L3084-L3120) |

## Lifecycle: вывод по коду

[Generate](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4291-L4365): `GENERATION_STARTED` → slash commands → `GENERATION_AFTER_COMMANDS` → group wrapper (если группа и ещё не generating). Эти события могут возникнуть снова для каждого участника; dryRun и quiet необходимо различать. Вызов stopGeneration из GENERATION_STARTED не является доказанным veto: новый controller устанавливается после события.

[Group wrapper](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/group-chats.js#L945-L1092): выбирает activatedMembers → при пустом списке сохраняет user message → `GROUP_WRAPPER_STARTED` → для каждого участника `GROUP_MEMBER_DRAFTED` → await Generate → возможные auto-continue → finally `GROUP_WRAPPER_FINISHED`. Выбор участников происходит **до** GROUP_WRAPPER_STARTED и interceptors. Ни return false из event handler, ни ошибка listener не являются контрактом отмены: [emitter](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/lib/eventemitter.js#L130-L158) ждёт handlers и ловит их ошибки.

`MESSAGE_SENT` возникает внутри сохранения user message ([source](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L5890-L5922)); запуск новой генерации из его awaited handler может конфликтовать с незавершённым wrapper. `GENERATION_ENDED` не следует трактовать как единственное завершение пользовательского хода: [unblock](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L3520-L3542). Для барьера группы использовать wrapper finish плюс состояние собственного scheduler; не считать событие доказательством успешного ответа.

[Event constants](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/events.js#L1-L65): CHAT_CHANGED, MESSAGE_SWIPED, MESSAGE_DELETED, GENERATION_STOPPED и group events существуют. Каждый callback перечитывает идентификатор чата, epoch и revision; stale результаты отбрасываются. Эти события сами по себе не задают транзакционную семантику.

## Hosted, безопасность и пределы гарантий

Клиентские JS/CSS/manifest и UI установки Git URL достаточны для выбранной архитектуры; server plugin и shell пользователя не требуются. Хост должен разрешать установку extensions и иметь Git. На момент исходного исследования manifest отсутствовал. В RPG Core первого этапа он добавлен; NPC Router этим изменением не затронут. API ключи не хранить в extension settings, state или логах; использовать настроенный ST backend. Поддержка GLM structured output, выбора отдельной модели и отмены proxy-запросов требует E2E; не менять глобальный preset незаметно.

Ограничение принципиально: prompt injection не является security boundary. Полная история группы, карточки, WI и сторонние extensions могут содержать скрытые сведения. Строгая приватность требует контролируемой сборки **всего** исходящего prompt и проверки payload; до этого не передавать приватные данные и не обещать отсутствие утечек. Уже видимый NPC-текст невозможно сделать неизвестным пользователю силами HUD. Аналогично инструкции модели не гарантируют запрет диалогов за Элис или слышимости: требуется проверка результата, карантин спорного ответа и ручное решение; streaming может показать текст до проверки. Для строгого режима рассмотреть буферизованную генерацию, не менять текст игрока.

Один browser writer на кампанию — исходное ограничение. Chat metadata не предоставляет CAS/межвкладочную блокировку. Export/import и резервные копии обязательны; многовкладочную/многопользовательскую запись не считать безопасной до отдельного решения.

## Вывод и архитектура RPG Core

Детерминированный engine и HUD технически реализуемы как browser extension. Строгая приватность и гарантии поведения LLM не обеспечиваются одним prompt injection. Автоматические события из прозы недопустимы. Численные правила SPEC остаются configurable TODO без выдуманных ставок, длительностей и медицинских вероятностей.

Слои будущей системы:

1. ST adapter + lifecycle: namespaced chatMetadata.rpgCore, settings отдельно; epoch на каждую загрузку/смену чата; не сохранять старый state в новый чат. Обработчики генераций собирают предложения, но не двигают clock.
2. Versioned store: schemaVersion, campaignId, revision, snapshot, event log, appliedEventIds, RNG state. Миграция на копии + backup + validation; unknown future schema открывать read-only. Импорт с проверкой структуры/размера, экспорт с явным выбором включения приватного состояния. Metadata хранится на сервере ST; это не шифрованное хранилище.
3. Command validator/reducer: проверка expectedRevision и event ID → вычисление полного next state → audit/provenance → замена snapshot+log в памяти → save → статус persistence. Атомарность только в пределах reducer в памяти; ошибки ST save не всегда throw. Dirty indicator, экспорт и проверка reload обязательны; нельзя обещать durable commit на одном resolved saveMetadata.
4. Детерминированные модули clock/location/inventory → hearing → остальные за feature flags. RNG с явным seed/algorithm version и сохранённым состоянием; повтор события не делает новый roll. Пропущенная конфигурация блокирует соответствующую механику, а не подставляет lore defaults. Игра не идёт по browser timer.
5. Proposal pipeline: структурированный envelope от LLM → schema → права/причинность/доступность ресурсов → подтверждение неопределённого события → reducer. Идентичность proposal: исходный message UUID + swipe/revision + event UUID. Re-generation не коммитит повторно, новый вариант не отменяет старые последствия молча. Удаление/редактирование после commit требует явного undo/branch/reconcile. Undo воспроизводит log/checkpoint и RNG; финансовые/инвентарные операции не применять вторично.
6. Visibility projection: world truth отдельно от player perception и actor knowledge. HUD получает только player projection; Router — capability-scoped read-only view. Входящий телефонный message — одно доменное событие с одним renderer, а не повторная экстракция из notification. Вывод только safe text/sanitized markup. Full-secret state нельзя случайно сериализовать в DOM/audit/prompt.
7. HUD: collapsible dock/float средствами собственного CSS/DOM, без обещания специального ST docking API; keyboard navigation, contrast, mobile checks. Все вкладки из SPEC, скрытые данные NPC не выводить по умолчанию. Реальные банки/соцсети/музыка/GPS не нужны: только in-world симуляции и metadata.
8. Prompt adapter: компактная разрешённая проекция с отдельным namespaced injection key; очищать при switch/disable. Hearing quality 0..5 — шесть значений; zero/removed/charging исключает hearing access соответствующего процессора. Это жёсткое правило engine/context, но не доказанный запрет текста модели. Не хранить непроверенные AI-прогнозы как каноническое состояние.

## Совместный контракт (проект, НЕ существующий API SillyTavern)

Опциональный `RpgCore API v1`: capability/version handshake; `getSnapshot({campaignId,chatEpoch,viewer,expectedRevision})` возвращает immutable scoped projection с revision, gameTime, actors, presence/channel constraints, relations, knowledge/perception; `subscribe` возвращает unsubscribe. Router не получает unrestricted truth. Неизвестные поля/major version → отключить integration и conservative fallback. Внутри одной страницы JS это логическое разграничение, а не защита от злонамеренного расширения.

Core отдельно работает без Router. Router отдельно использует подтверждённое lightweight состояние. Router только предлагает события с provenance, reducer Core единственный автор state; ни один generation event не эквивалентен команде advanceTime. Микрособытия планируются по игровому времени с event IDs, не setInterval как источник истины.

## Поэтапный план и acceptance gates

1. Завершить runtime investigation: целевая версия, two-character lifecycle logs, metadata save/reload, scoped outgoing payload, stop/switch. Пока не выполнено.
2. Scaffold + store/migrations + минимальный HUD + harness: reload/import/export/backup, switch isolation, rejection unknown schema, save failure indicator. Без десяти модулей сразу.
3. Clock/location/inventory/event log: фиксированный seed даёт одинаковый результат; дубли событий не меняют revision, баланс, предметы и время; travel не телепортирует акторов; undo/replay восстанавливает RNG.
4. Hearing: zero/removed/charging/overload, один работающий процессор, разрешённые text/sign/vibration channels; приватное неизвестное содержание не показывается как услышанное. Не заданные rates остаются заблокированными TODO.
5. Остальные модули отдельными изменениями: physiology/health/relationships/devices/skills/calendar/arcs; проверка границ и отсутствующих правил каждого модуля. Структурированные уведомления имеют один event ID; нет настоящих external transactions.
6. Router v1 integration: absent/present/remote, несовместимая версия, смена revision во время classifier, interrupt, regen/swipe/retry без повторного commit и утечек.

На каждом этапе: unit tests reducer/validation/projections, затем браузерный harness. Обязательны interrupted generation, reload и несколько вкладок (вторая должна быть read-only либо явно unsupported). Пороговые числа, cycle/pregnancy risks, DC, расходы времени, валюты и тема остаются пользовательскими настройками/TODO; для исследования они не блокируют работу.
