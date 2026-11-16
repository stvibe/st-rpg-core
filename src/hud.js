import { MODULE_LABELS, playerView } from './model.js';
const DESCRIPTIONS = {
    hearing: 'Ручное состояние процессоров. Качество 0–5; null — неизвестно. Расход и зарядка пока не рассчитываются.',
    physiology: 'Структура физиологии. Вероятности, фазы и длительности — TODO. Автоматических расчётов нет.',
    devices: 'Вымышленные устройства, сообщения, банковский журнал, криптокошельки и музыкальные ссылки. Реальных подключений нет.',
    inventory: 'Предметы: ID, владелец, контейнер, локация, количество и заряды задаются явно. Автоматического расхода нет.',
    skills: 'Навыки и будущие правила проверок. Броски, DC и модификаторы пока не рассчитываются.',
    locations: 'Места, акторы и поездки задаются явно. Таймскип сам по себе никого не перемещает.',
    health: 'Травмы, усталость и стресс. Пороговые значения и штрафы — TODO.',
    relationships: 'Направленные отношения между персонажами. Только известные игроку сведения.',
    calendar: 'Игровые события и даты. Таймеры и расписания пока не исполняются автоматически.',
    quests: 'Арки, чеклисты и микрособытия. Никаких новых сюжетов без решения игрока.',
};
function element(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
}
function button(label, action, attrs = {}) {
    const node = element('button', label, { type: 'button', ...attrs });
    node.addEventListener('click', action); return node;
}
function field(parent, label, input) {
    const wrapper = element('label', undefined, { class: 'rpg-field' });
    wrapper.append(element('span', label), input); parent.append(wrapper); return input;
}
function input(value, type = 'text') {
    const node = element('input', undefined, { type }); node.value = value ?? ''; return node;
}
function download(value, name) {
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const link = element('a', 'JSON', { href: url, download: name }); link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function createHud() {
    let root, active = 'status';
    return function render(view) {
        root?.remove(); root = null;
        if (!view) return;
        const { store, settings, actions } = view;
        root = element('aside', undefined, { id: 'rpg-core-hud', 'aria-label': 'RPG Core' });
        const header = element('header');
        const toggle = button('RPG Core', () => actions.setting('collapsed', !settings.collapsed), { 'aria-expanded': !settings.collapsed, 'aria-controls': 'rpg-core-body' });
        const clock = store.state?.clock.iso?.slice(0, 16).replace('T', ' ') ?? 'Дата не задана';
        header.append(toggle, element('span', clock, { class: 'rpg-clock' })); root.append(header);
        const body = element('div', undefined, { id: 'rpg-core-body' }); body.hidden = settings.collapsed;
        const status = element('p', store.error || store.status, { role: 'status', class: store.error ? 'rpg-error' : 'rpg-status' });
        const alert = element('p', '', { role: 'alert', class: 'rpg-error' });
        body.append(status, alert);
        const run = async action => {
            try { await action(); } catch (error) {
                // An async save may have caused a redraw: report to the current live alert.
                const target = document.querySelector('#rpg-core-hud [role="alert"]');
                if (target) target.textContent = error.message;
            }
        };
        const tabs = [['status', 'Статус'], ...Object.entries(MODULE_LABELS), ['log', 'Журнал'], ['settings', 'Настройки']];
        const nav = element('div', undefined, { role: 'tablist', 'aria-label': 'Модули RPG', class: 'rpg-tabs' });
        for (const [id, label] of tabs) {
            const tab = button(label, () => { active = id; render(view); document.getElementById(`rpg-tab-${id}`)?.focus(); }, {
                id: `rpg-tab-${id}`, role: 'tab', 'aria-selected': active === id,
                'aria-controls': 'rpg-panel', tabindex: active === id ? 0 : -1,
            });
            tab.addEventListener('keydown', event => {
                const index = tabs.findIndex(([key]) => key === id);
                const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
                if (target !== null) { event.preventDefault(); active = tabs[target][0]; render(view); document.getElementById(`rpg-tab-${active}`)?.focus(); }
            });
            nav.append(tab);
        }
        body.append(nav);
        const panel = element('section', undefined, { id: 'rpg-panel', role: 'tabpanel', 'aria-labelledby': `rpg-tab-${active}`, tabindex: 0 });
        body.append(panel); root.append(body); document.body.append(root);
        if (active === 'settings') {
            for (const [key, label] of [['enabled', 'RPG Core включён'], ['inject', 'Передавать состояние в контекст ИИ']]) {
                const checkbox = input('', 'checkbox'); checkbox.checked = settings[key];
                checkbox.addEventListener('change', () => actions.setting(key, checkbox.checked)); field(panel, label, checkbox);
            }
            panel.append(element('p', 'Одна вкладка редактирования на кампанию. Metadata не зашифрованы; подтверждение ST не гарантирует запись на сервер. После важных изменений проверьте перезагрузку и сохраните резервную копию.'));
        }
        if (!store.state || store.error) {
            panel.append(element('p', store.error ? 'Данные недоступны. Исходная metadata не перезаписана. Для неизвестной версии требуется совместимая версия расширения.' : 'Откройте сохранённый одиночный или групповой чат, чтобы настроить RPG Core.'));
            return;
        }
        const state = playerView(store.state); const revision = state.revision;
        const controls = element('fieldset'); controls.disabled = store.busy || !settings.enabled;
        panel.append(controls);
        if (active === 'status') {
            const form = element('form');
            const name = field(form, 'Имя персонажа', input(state.player.name)); name.maxLength = 200;
            const location = field(form, 'Локация (пусто — неизвестна)', input(state.player.location)); location.maxLength = 2000;
            const notes = element('textarea'); notes.value = state.player.notes; notes.maxLength = 2000;
            field(form, 'Известные игроку сведения', notes);
            form.append(element('button', 'Сохранить персонажа', { type: 'submit' }));
            form.addEventListener('submit', event => {
                event.preventDefault(); run(() => actions.change('player', { name: name.value, location: location.value || null, notes: notes.value }, undefined, revision));
            }); controls.append(form);
            controls.append(element('p', `Игровых минут прошло: ${state.clock.elapsedMinutes}. Ревизия: ${state.revision}.`));
        }
        if (active === 'calendar') {
            const set = element('form');
            const date = field(set, 'Игровая дата и время (без привязки к часовому поясу компьютера)', input(state.clock.iso?.slice(0, 16), 'datetime-local'));
            date.required = true; date.min = '0001-01-01T00:00'; date.max = '9999-12-31T23:59';
            set.append(element('button', 'Установить дату', { type: 'submit' }));
            set.addEventListener('submit', event => { event.preventDefault(); run(() => actions.change('clock.set', date.value, undefined, revision)); });
            const skip = element('form');
            const minutes = field(skip, 'Таймскип в игровых минутах', input('', 'number'));
            minutes.required = true; minutes.min = '1'; minutes.step = '1';
            skip.append(element('button', 'Применить таймскип', { type: 'submit' }));
            skip.addEventListener('submit', event => { event.preventDefault(); run(() => actions.change('clock.advance', Number(minutes.value), undefined, revision)); });
            controls.append(set, skip);
        }
        if (MODULE_LABELS[active]) {
            controls.append(element('p', DESCRIPTIONS[active]));
            const data = state.modules[active];
            const summary = element('div', undefined, { class: 'rpg-module-summary' });
            if (active === 'hearing') {
                for (const [side, label] of [['left', 'Левый процессор'], ['right', 'Правый процессор']]) {
                    const card = element('div', undefined, { class: 'rpg-card' });
                    card.append(element('strong', label));
                    card.append(element('p', `Батарея: ${data[side].battery === null ? 'неизвестно' : data[side].battery + '%'}`));
                    const known = value => value === null ? 'неизвестно' : value ? 'да' : 'нет';
                    card.append(element('p', `Надет: ${known(data[side].worn)} · Заряжается: ${known(data[side].charging)}`));
                    summary.append(card);
                }
                summary.append(element('p', `Качество: ${data.quality ?? 'неизвестно'} · Помехи: ${data.interference ?? 'неизвестно'}`));
            } else {
                const labels = {records:'Записи', items:'Предметы и устройства', messages:'Сообщения', ledger:'Операции', wallets:'Кошельки', music:'Музыка', entries:'Записи', actors:'Персонажи', places:'Места', travel:'Поездки', injuries:'Травмы', arcs:'Сюжетные арки', microevents:'Микрособытия'};
                for (const [key, records] of Object.entries(data)) {
                    if (!Array.isArray(records)) continue;
                    summary.append(element('h3', `${labels[key] ?? key} · ${records.length}`));
                    if (!records.length) summary.append(element('p', 'Пока нет записей.'));
                    const list = element('ul');
                    for (const record of records) list.append(element('li', String(record.label ?? record.name ?? record.title ?? record.description ?? 'Запись без названия')));
                    summary.append(list);
                }
            }
            controls.append(summary);
            const advanced = element('details');
            advanced.append(element('summary', 'Изменить данные модуля (JSON)'));
            advanced.append(element('p', 'Только сведения игрока. У каждой записи массива обязательны уникальный id и knownToPlayer: true. null — неизвестно / TODO. Сложные механики ещё не выполняются.'));
            controls.append(advanced);
            const editor = element('textarea', undefined, { rows: 12, spellcheck: 'false', 'aria-label': `Данные: ${MODULE_LABELS[active]}` });
            editor.value = JSON.stringify(state.modules[active], null, 2);
            advanced.append(editor, button('Сохранить модуль', () => run(() => actions.change('module', JSON.parse(editor.value), active, revision))));
        }
        if (active === 'log') {
            controls.append(element('p', 'Журнал явных действий. Генерация, swipe и регенерация сами по себе не меняют состояние. Последние 200 записей; ID применённых событий сохраняются отдельно.'));
            const list = element('ol');
            for (const entry of [...store.state.log].reverse()) list.append(element('li', `#${entry.revision}: ${entry.type}`));
            controls.append(list);
        }
        if (active === 'settings') {
            controls.append(button('Повторить сохранение', () => run(() => actions.save())));
            controls.append(button('Восстановить предыдущую версию', () => run(() => actions.restore())));
            panel.append(button('Экспорт сведений игрока', () => run(() => download(actions.export(false), 'rpg-player-view.json'))));
            panel.append(button('Полная резервная копия JSON', () => {
                if (confirm('Полная копия содержит скрытые данные мира и знания NPC. Сохранить файл?')) run(() => download(actions.export(true), 'rpg-core-backup.json'));
            }));
            const file = field(controls, 'Импорт полной копии (заменит состояние этого чата)', input('', 'file'));
            file.accept = '.json,application/json';
            file.addEventListener('change', () => run(async () => {
                const selected = file.files?.[0]; if (!selected) return;
                if (selected.size > 1_000_000) throw new Error('Файл превышает 1 МБ');
                if (!confirm('Заменить состояние текущего чата? Предыдущее состояние останется резервной версией.')) return;
                // Read file against captured chat/revision, not whichever chat is open when read completes.
                const epoch = store.epoch; const raw = await selected.text();
                if (epoch !== store.epoch || revision !== store.state?.revision) throw new Error('Чат или состояние изменились; повторите импорт');
                await actions.import(raw);
            }));
            controls.append(element('p', 'Скрытые worldFacts и npcKnowledge редактируются через полную JSON-копию и явный импорт. HUD и контекст ИИ их не показывают. Экспорт сведений игрока не является полной копией для восстановления.'));
        }
    };
}
