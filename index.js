import { createApp } from './src/app.js';
import { createHud } from './src/hud.js';
let app;
let readyListener;
/** Extension integration API v1: read-only, player-known projection; null when unavailable. */
export const API_VERSION = 1;
export function getPlayerSnapshot() { return app?.actions.getSnapshot() ?? null; }
function start(forceEnable = false) {
    if (app) return;
    const folder = new URL('.', import.meta.url).pathname.split('/scripts/extensions/')[1]?.replace(/\/$/, '');
    if (!forceEnable && folder && SillyTavern.getContext().extensionSettings.disabledExtensions?.includes(folder)) return;
    try { app = createApp(() => SillyTavern.getContext(), createHud()); }
    catch (error) {
        console.error('[RPG Core] Не удалось запустить:', error.message);
        globalThis.toastr?.error(error.message, 'RPG Core');
    }
}
export function onDisable() {
    const context = SillyTavern.getContext();
    if (readyListener) context.eventSource.removeListener(context.eventTypes.APP_READY, readyListener);
    readyListener = undefined;
    app?.stop(); app = undefined;
}
export function onEnable() { start(true); }
// APP_READY auto-fires for late listeners in the verified upstream emitter.
const context = SillyTavern.getContext();
readyListener = () => { start(); };
context.eventSource.on(context.eventTypes.APP_READY, readyListener);
