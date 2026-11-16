# Состояние v1

`schemaVersion: 1`, `campaignId` (UUID), `revision` (монотонный номер).

| Поле | Содержание | Статус |
| --- | --- | --- |
| clock | iso: null или YYYY-MM-DDTHH:mm:00.000Z; elapsedMinutes | Ручная установка и целочисленные таймскипы |
| player | name, location: null/string, notes | Ручная коррекция |
| modules.hearing | left/right: battery, worn, charging, connected, operational; quality 0..5, interference, overload, bluetooth, rules | Ручные значения, без drain/charging simulation |
| modules.physiology | records[], rules | TODO: cycles, pregnancies, durations, probabilities |
| modules.devices | items[], messages[], ledger[], wallets[], music[] | Только запись известных данных; никаких external services |
| modules.inventory | items[] | TODO: consumption, ownership/container invariants |
| modules.skills | entries[], rules | TODO: deterministic RNG, DC, checks |
| modules.locations | actors[], places[], travel[] | TODO: travel validation; никаких реальных маршрутов |
| modules.health | injuries[], fatigue, stress, rules | TODO: penalties, healing |
| modules.relationships | entries[] | TODO: directional relationship invariants |
| modules.calendar | entries[] | TODO: schedules and recurring dates |
| modules.quests | arcs[], microevents[] | TODO: lifecycle and game-time triggers |
| private | worldFacts[], npcKnowledge: object | World truth и личные знания, никогда не player projection |
| log | последние 200 {id, revision, type} | Типы ручных операций, без скрытого payload |
| appliedEventIds | уникальные event ID | Дедупликация, включая восстановление |

В массиве будущего модуля запись — JSON object с непустым уникальным `id`, `knownToPlayer: true` и пользовательскими данными. Вложенные игровые свойства пока расширяемы: валидируется JSON-безопасность и размер, **не** все будущие доменные инварианты. Так, ledger — подготовленная структура, не работающий банк, items — ручные данные, не гарантии расхода. Неподтверждённые/тайные сведения в таких массивах запрещены; их место в `private`. Rules — null или объект-заготовка, не исполняемый код.

Численные lore-critical правила не заданы. `null` означает неизвестное/TODO. Никакого автоматического RNG, беременности, травм, банковских переводов или маршрутизации NPC на данном этапе.

## Транзакции внутри клиента

Команда содержит ID и expectedRevision. Pure reducer валидирует полную копию, изменяет её, добавляет log/ID и только затем передаёт store. Повтор ID — no-op; устаревшая revision другого события отклоняется. Store сохраняет предыдущее состояние и новое в объект metadata текущего чата, затем вызывает saveMetadata. Chat key содержит тип чата, group ID либо avatar карточки и chatId; async completion проверяет epoch. Ни один старый результат не присваивается metadata нового чата.

Это атомарность в памяти одной вкладки, не серверная транзакция. Promise сохранения может быть непрозрачен. Нет multi-writer CAS. Backup — предыдущая версия, не полный event-sourcing; длинный исторический replay/многоуровневый rollback и миграции — отдельная фаза.
