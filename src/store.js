import { clone, createState, validateState, decodeState, transition } from './model.js';
export const STATE_KEY = 'rpgCore';
export const BACKUP_KEY = 'rpgCoreBackup';
export const PROMPT_KEY = 'rpg-core-state-v1';
export function chatKey(context) {
    if (context.chatId === undefined || context.chatId === null || context.chatId === '') return null;
    const owner = context.groupId !== null && context.groupId !== undefined
        ? ['group', context.groupId]
        : ['character', context.characters?.[context.characterId]?.avatar];
    if (owner[1] === undefined || owner[1] === null) return null;
    return JSON.stringify([...owner, context.chatId]);
}
export function checkContext(context) {
    for (const name of ['setExtensionPrompt', 'saveMetadata', 'saveSettingsDebounced']) {
        if (typeof context[name] !== 'function') throw new Error(`SillyTavern: недоступен API ${name}`);
    }
    if (!context.eventSource?.on || !context.eventSource?.removeListener || !context.eventTypes?.CHAT_CHANGED || !context.eventTypes?.GENERATION_AFTER_COMMANDS) {
        throw new Error('SillyTavern: несовместимый API событий');
    }
    if (!context.extensionSettings || !context.chatMetadata) throw new Error('SillyTavern: нет settings/metadata');
}
/** Captures metadata object and chat epoch. Never assigns an old state into a fresh context. */
export class ChatStore {
    constructor(getContext, uuid = () => crypto.randomUUID()) {
        this.getContext = getContext; this.uuid = uuid; this.epoch = 0; this.busy = false;
        this.state = null; this.error = ''; this.status = ''; this.key = null;
    }
    load() {
        this.epoch++; this.state = null; this.error = ''; this.status = '';
        const context = this.getContext(); this.key = chatKey(context); this.metadata = context.chatMetadata;
        if (!this.key) { this.status = 'Откройте сохранённый чат'; return; }
        try {
            const raw = this.metadata[STATE_KEY];
            this.state = clone(raw === undefined ? createState(this.uuid()) : validateState(raw));
            this.status = raw === undefined ? 'Новое состояние — ещё не сохранено' : 'Загружено из metadata чата';
        } catch (error) { this.error = error.message; }
    }
    current() {
        return this.key !== null && this.key === chatKey(this.getContext()) && this.metadata === this.getContext().chatMetadata;
    }
    snapshot() { return this.state ? clone(this.state) : null; }
    command(type, value, module, id = this.uuid(), expectedRevision = this.state?.revision) {
        return this.commit(() => transition(this.state, { id, type, value, module, expectedRevision }));
    }
    async commit(makeNext, { backup = true } = {}) {
        if (this.busy) throw new Error('Дождитесь завершения сохранения');
        if (!this.current() || !this.state || this.error) throw new Error('Чат изменился или состояние недоступно');
        const next = validateState(makeNext());
        if (next === this.state) return; // duplicate event, no persistence side effect
        const previous = this.metadata[STATE_KEY];
        if (backup && previous !== undefined) this.metadata[BACKUP_KEY] = clone(previous);
        this.state = clone(next); this.metadata[STATE_KEY] = clone(next);
        this.busy = true; const epoch = this.epoch;
        this.status = 'Сохранение…';
        try {
            // ST can swallow HTTP errors: a resolved promise only means the save was requested.
            await this.getContext().saveMetadata();
            if (epoch === this.epoch && this.current()) this.status = 'Передано на сохранение ST; проверьте после перезагрузки';
        } catch {
            if (epoch === this.epoch) this.status = 'Ошибка сохранения. Состояние в памяти: экспортируйте JSON и повторите';
            throw new Error('Не удалось сохранить состояние');
        } finally { this.busy = false; }
    }
    persist() { return this.commit(() => clone(this.state)); }
    import(raw) {
        const imported = decodeState(raw);
        return this.commit(() => {
            const next = clone(imported);
            // Import is explicit replacement in this chat, with a monotonic local revision.
            next.revision = Math.max(this.state.revision, next.revision) + 1;
            const id = this.uuid(); next.appliedEventIds.push(id);
            next.log = [...next.log, { id, revision: next.revision, type: 'import' }].slice(-200);
            return next;
        });
    }
    restore() {
        const backup = clone(validateState(this.metadata?.[BACKUP_KEY]));
        return this.commit(() => {
            const next = backup; next.revision = this.state.revision + 1;
            const id = this.uuid();
            next.appliedEventIds = [...new Set([...this.state.appliedEventIds, ...next.appliedEventIds, id])];
            next.log = [...this.state.log, { id, revision: next.revision, type: 'restore' }].slice(-200);
            return next;
        });
    }
}
