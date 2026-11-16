export class Events {
    handlers = new Map();
    on(name, callback) { this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]); }
    removeListener(name, callback) { this.handlers.set(name, (this.handlers.get(name) ?? []).filter(x => x !== callback)); }
    async emit(name, ...args) { for (const callback of [...(this.handlers.get(name) ?? [])]) await callback(...args); }
}
export const eventTypes = Object.fromEntries(['APP_READY', 'CHAT_CHANGED', 'GENERATION_AFTER_COMMANDS', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_STOPPED', 'GENERATION_ENDED'].map(x => [x, x]));
export function fixture() {
    const eventSource = new Events(); const prompts = new Map();
    const settings = {}; const metadata = new Map([['A', {}], ['B', {}]]);
    let current = 'A', saved = 0, saveImpl = async () => {};
    const getContext = () => ({
        chatId: current, groupId: null, characterId: 0, characters: [{ avatar: 'alice.png' }],
        chatMetadata: metadata.get(current), extensionSettings: settings, eventSource, eventTypes,
        setExtensionPrompt: (key, value, position, depth, scan, role) => prompts.set(key, { value, position, depth, scan, role }),
        saveMetadata: async () => { saved++; await saveImpl(); }, saveSettingsDebounced() {},
    });
    return { getContext, prompts, metadata, eventSource, settings,
        switchTo: chat => { current = chat; }, get saved() { return saved; },
        setSave: fn => { saveImpl = fn; },
    };
}
