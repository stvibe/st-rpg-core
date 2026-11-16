# Проверки RPG Core 0.1.0

Дата: 2026-11-16. Node.js 24.22.1, системный Chromium, playwright-core 1.58.2. Upstream SillyTavern release 1.19.0, SHA `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.

## Первый этап реализации

- `npm test`: **20/20** unit/contract tests. Проверены schema/import limits и unknown version, неподтверждённые public records, отсутствие приватных полей в player projection, часы/leap day/overflow, ID-дедупликация, stale revision, save rejection/retry, backup/import/restore, чат-switch во время save, отсутствие переходов на emitted generation/swipe/stop events и disable при pending save.
- `npm run check`: синтаксис entry и всех runtime-модулей проверен.
- `npm run test:browser`: **5/5** headless Chromium сценариев. Настоящий entry/UI с контрактным mock ST: все вкладки, стрелки/Home/End, collapse, mobile 375px, clock/reload/chat switch, invalid JSON/XSS-as-text, disable/enable/injection settings, подтверждённый full import и restore.
- `ST_URL=http://127.0.0.1:8123 npm run test:upstream`: **PASS** на настоящем локальном SillyTavern. Проверены загрузка расширения, ручная дата/таймскип, HTTP save и reload, сохранение скрытых world/NPC данных без их попадания в HUD или собранный OpenAI prompt, изоляция одиночных и групповых чатов (включая совпадающие filenames), emitted lifecycle no-op, реальная сборка OpenAI prompt через `generate('normal', {}, true)`. Реальный запрос к платной модели не выполнялся.

Real-upstream проверка обнаружила устаревшую надпись о сохранении во время импорта: UI не показывал pending save, и немедленный reload мог прервать запрос. Исправлено единым perform для всех записей и отдельным regression test. Повторный real-upstream smoke с private import + reload прошёл.

Результат smoke:

```text
PASS real ST: entry, clock/time skip, HTTP save/reload, character/group chat isolation including same filename, lifecycle no-op, assembled OpenAI dry-run prompt without private facts
```

## Воспроизведение real-upstream smoke

Использовать только выделенный тестовый data root: сценарий создаёт новые тестовые чаты и группу, импортирует фиктивные секреты, не удаляет пользовательские данные. Upstream test использует проверенные `selectCharacterById`/`openCharacterChat`, `getGroups`/`openGroupById`/`openGroupChat` и `/api/groups/create` только для подготовки теста; product code не вызывает endpoint создания групп.

```sh
git clone --branch release https://github.com/SillyTavern/SillyTavern.git /tmp/st-upstream
git -C /tmp/st-upstream checkout 06bde939fb1e9c4c8d8641d810f0a916b5bce127
cd /tmp/st-upstream
npm ci --cache /tmp/rpg-npm-cache --no-audit --no-fund
node server.js --port 8123 --dataRoot /tmp/rpg-st-data --listen false --browserLaunchEnabled false
```

После первого старта в отдельном терминале установить extension в тестовый профиль: UI Git URL + branch, либо для локальной разработки symlink `/tmp/rpg-st-data/default-user/extensions/st-rpg-core` → checkout проекта. В тестовом ST пройти welcome, выбрать OpenAI без API-ключа и без подключения модели (это избегает ненужного default Horde network probe). Нужна хотя бы одна тестовая карточка; default Seraphina подходит.

Из checkout RPG Core:

```sh
npm ci --cache /tmp/rpg-npm-cache
ST_URL=http://127.0.0.1:8123 CHROMIUM_PATH=/usr/bin/chromium npm run test:upstream
```

В CI выполняются unit/syntax и mock-browser checks; настоящий ST smoke — отдельная ручная проверка с указанным выше server. CI ещё не был выполнен на GitHub в этой сессии.

## Что не проверено и не заявляется

- Установка через Git URL именно на hosted-инсталляции пользователя, её неизвестная версия и политики хоста.
- GLM-5.3/proxy, реальная платная генерация, фактические regenerate/swipe/interrupt во время model request. Emitted lifecycle tests подтверждают отсутствие переходов в нашем обработчике, но не весь внешний pipeline.
- Строгая изоляция всего контекста от других extensions, истории и World Info. Проверен только контролируемый исходящий dry-run prompt тестового чата.
- Многовкладочная/многопользовательская запись, подтверждение durable save при ошибке, скрытой самим ST. Это ограничения, не пройденные тесты.
- Сложные механики, Router dispatch, scheduled jobs, RNG и миграции из будущих схем: не реализованы в первом этапе.

## Исходное исследование EventEmitter

Ниже сохранён результат изолированного source-теста до реализации. Он не заменяет текущие проверки.

## Выполнено

- Чтение SPEC.md и AGENTS.md в обоих репозиториях, upstream source и official Writing Extensions/install docs.
- Реальный upstream EventEmitter импортирован в Node, localStorage заменён минимальным stub. Проверены await ordering и отсутствие veto через return false. Это изолированный тест emitter, не браузерный group-generation E2E.
- Результат (exit 0):

```text
Event emitted: probe
["first:start","first:end","second","emit:resolved"]
PASS: awaited ordering; return false does not veto later listener
```

## Воспроизведение

При наличии Node.js и checkout upstream в /tmp/st-upstream на указанном SHA сохранить следующий код вне репозитория как /tmp/check-st-emitter.mjs и выполнить `node /tmp/check-st-emitter.mjs`:

```js
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
globalThis.localStorage = {getItem: () => null};
const code = readFileSync('/tmp/st-upstream/public/lib/eventemitter.js','utf8');
const {EventEmitter} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const e = new EventEmitter([]);
const trace=[];
e.on('probe',async()=>{trace.push('first:start');await Promise.resolve();trace.push('first:end');return false;});
e.on('probe',()=>trace.push('second'));
await e.emit('probe');trace.push('emit:resolved');
assert.deepEqual(trace,['first:start','first:end','second','emit:resolved']);
console.log(JSON.stringify(trace));
console.log('PASS: awaited ordering; return false does not veto later listener');
```
