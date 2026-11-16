import { buildPrompt, playerView } from './model.js';
import { ChatStore, PROMPT_KEY, checkContext } from './store.js';
/** ST numeric enums verified in script.js at pinned SHA; no guessed method names. */
const IN_CHAT = 1;
const SYSTEM = 0;
export function createApp(getContext, render) {
    checkContext(getContext());
    const store = new ChatStore(getContext);
    const subscriptions = [];
    let stopped = false;
    const settings = () => {
        const context = getContext();
        context.extensionSettings.rpgCore ??= { enabled: true, inject: true, collapsed: true };
        return context.extensionSettings.rpgCore;
    };
    function prompt() {
        const context = getContext();
        const value = !stopped && settings().enabled && settings().inject && store.current() && store.state && !store.error
            ? buildPrompt(store.state) : '';
        context.setExtensionPrompt(PROMPT_KEY, value, IN_CHAT, 0, false, SYSTEM);
    }
    function redraw() { render(stopped ? null : { store, settings: settings(), actions }); }
    function load() { if (stopped) return; store.load(); prompt(); redraw(); }
    function writable() { if (stopped || !settings().enabled) throw new Error('RPG Core выключен'); }
    async function perform(operation) {
        writable();
        const pending = operation();
        prompt(); redraw();
        try { await pending; } finally { prompt(); redraw(); }
    }
    const actions = {
        change(type, value, module, revision) { return perform(() => store.command(type, value, module, undefined, revision)); },
        save() { return perform(() => store.persist()); },
        import(raw) { return perform(() => store.import(raw)); },
        restore() { return perform(() => store.restore()); },
        setting(key, value) {
            if (!['enabled', 'inject', 'collapsed'].includes(key) || typeof value !== 'boolean') return;
            settings()[key] = value; getContext().saveSettingsDebounced(); prompt(); redraw();
        },
        export(includePrivate = false) { return JSON.stringify(includePrivate ? store.snapshot() : playerView(store.state), null, 2); },
        // Explicitly read-only integration surface, only the player-known projection in v1.
        getSnapshot() { return !stopped && settings().enabled && store.current() && store.state && !store.error ? playerView(store.state) : null; },
    };
    const context = getContext();
    function listen(name, callback) {
        const event = context.eventTypes[name];
        if (!event) return;
        context.eventSource.on(event, callback); subscriptions.push([event, callback]);
    }
    listen('CHAT_CHANGED', load);
    listen('GENERATION_AFTER_COMMANDS', () => { if (!store.current()) load(); else prompt(); });
    // No generation event changes state, advances time or saves metadata.
    for (const name of ['MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_STOPPED', 'GENERATION_ENDED']) listen(name, prompt);
    load();
    return {
        store, actions,
        stop() {
            stopped = true;
            for (const [event, callback] of subscriptions) context.eventSource.removeListener(event, callback);
            prompt(); render(null);
        },
    };
}
