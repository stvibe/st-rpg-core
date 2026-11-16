import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatStore, STATE_KEY, BACKUP_KEY, PROMPT_KEY, chatKey } from '../src/store.js';
import { createState } from '../src/model.js';
import { createApp } from '../src/app.js';
import { fixture } from './fixture.js';
function setup() { const f = fixture(); let seq = 0; const store = new ChatStore(f.getContext, () => `id-${seq++}`); store.load(); return { f, store }; }
test('metadata survives fresh store; character and group chat identities cannot collide', async () => {
    const { f, store } = setup();
    await store.command('clock.set', '2026-01-01T00:00'); await store.command('clock.advance', 30);
    const reload = new ChatStore(f.getContext); reload.load();
    assert.deepEqual(reload.snapshot(), store.snapshot());
    assert.notEqual(chatKey(f.getContext()), chatKey({ ...f.getContext(), groupId: 0 }));
    assert.notEqual(chatKey(f.getContext()), chatKey({ ...f.getContext(), characters: [{ avatar: 'other.png' }] }));
});
test('chat switch isolates state, prompt and return to previous chat', async () => {
    const { f, store } = setup(); await store.command('clock.set', '2026-01-01T00:00');
    const a = store.snapshot(); f.switchTo('B'); store.load();
    assert.equal(store.state.clock.iso, null); assert.notEqual(store.state.campaignId, a.campaignId);
    await store.command('player', { name: 'Другой', location: 'B', notes: '' });
    f.switchTo('A'); store.load(); assert.deepEqual(store.snapshot(), a);
    assert.equal(f.metadata.get('B').rpgCore.player.name, 'Другой');
});
test('switch during pending save never applies old state or old completion to new chat', async () => {
    const { f, store } = setup(); let finish;
    f.setSave(() => new Promise(resolve => { finish = resolve; }));
    const save = store.command('clock.set', '2026-01-01T00:00');
    f.switchTo('B'); store.load(); const status = store.status;
    await assert.rejects(store.command('clock.set', '2027-01-01T00:00'), /Дождитесь/);
    finish(); await save;
    assert.equal(store.status, status); assert.equal(store.state.clock.iso, null);
    assert.equal(f.metadata.get('B').rpgCore, undefined);
    assert.equal(f.metadata.get('A').rpgCore.clock.iso, '2026-01-01T00:00:00.000Z');
});
test('unannounced chat switch blocks mutation until load', async () => {
    const { f, store } = setup(); f.switchTo('B');
    await assert.rejects(store.command('clock.set', '2026-01-01T00:00'), /Чат изменился/);
    assert.equal(f.metadata.get('B').rpgCore, undefined);
});
test('save rejection preserves recoverable state and retry works; resolved save does not claim durable success', async () => {
    const { f, store } = setup();
    f.setSave(async () => { throw new Error('offline'); });
    await assert.rejects(store.command('clock.set', '2026-01-01T00:00'));
    assert.match(store.status, /Ошибка/); assert.equal(store.busy, false);
    const recovery = JSON.stringify(store.snapshot());
    f.setSave(async () => {}); await store.persist();
    assert.equal(JSON.stringify(store.snapshot()), recovery);
    assert.match(store.status, /проверьте после перезагрузки/);
});
test('backup restore and import are explicit, reversible, monotonic; old IDs stay deduplicated', async () => {
    const { f, store } = setup();
    await store.command('clock.set', '2026-01-01T00:00', undefined, 'initial');
    await store.command('clock.advance', 60, undefined, 'skip');
    await store.restore(); assert.equal(store.state.clock.elapsedMinutes, 0); assert.equal(store.state.revision, 3);
    const saves = f.saved; await store.command('clock.advance', 60, undefined, 'skip');
    assert.equal(f.saved, saves); assert.equal(store.state.clock.elapsedMinutes, 0);
    const incoming = createState('imported'); incoming.private.worldFacts = ['SECRET'];
    await store.import(JSON.stringify(incoming));
    assert.equal(store.state.revision, 4); assert.equal(store.state.campaignId, 'imported');
    assert.equal(f.metadata.get('A')[BACKUP_KEY].clock.iso, '2026-01-01T00:00:00.000Z');
    await store.restore(); assert.equal(store.state.clock.iso, '2026-01-01T00:00:00.000Z');
});
test('future schema and corrupt import are rejected without overwriting metadata', async () => {
    const { f, store } = setup(); await store.persist(); const before = JSON.stringify(f.metadata.get('A'));
    assert.throws(() => store.import('{bad'));
    assert.equal(JSON.stringify(f.metadata.get('A')), before);
    f.metadata.get('A')[STATE_KEY] = { schemaVersion: 99, secret: 'preserve' };
    store.load(); assert.equal(store.state, null); assert.match(store.error, /версия/);
    await assert.rejects(store.persist()); assert.equal(f.metadata.get('A')[STATE_KEY].secret, 'preserve');
});
test('generation, retry, swipe, delete and stop events never change state or save; latest projection is injected', async () => {
    const f = fixture(); const app = createApp(f.getContext, () => {});
    await app.actions.change('clock.set', '2026-01-01T00:00');
    await app.actions.change('clock.advance', 17);
    const before = app.store.snapshot(), saves = f.saved;
    for (const event of ['GENERATION_AFTER_COMMANDS', 'GENERATION_AFTER_COMMANDS', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_STOPPED', 'GENERATION_ENDED']) await f.eventSource.emit(event, 'regenerate');
    assert.deepEqual(app.store.snapshot(), before); assert.equal(f.saved, saves);
    const prompt = f.prompts.get(PROMPT_KEY);
    assert.match(prompt.value, /00:17/); assert.equal(prompt.position, 1); assert.equal(prompt.scan, false); assert.equal(prompt.role, 0);
    f.switchTo('B'); await f.eventSource.emit('CHAT_CHANGED');
    assert.doesNotMatch(f.prompts.get(PROMPT_KEY).value, /00:17/);
    app.stop(); assert.equal(f.prompts.get(PROMPT_KEY).value, '');
});
test('disable during save cannot resurrect HUD or injection after completion', async () => {
    const f = fixture(); let finish; const views = [];
    const app = createApp(f.getContext, view => views.push(view));
    f.setSave(() => new Promise(resolve => { finish = resolve; }));
    const pending = app.actions.change('clock.set', '2026-01-01T00:00');
    app.stop(); finish(); await pending;
    assert.equal(views.at(-1), null); assert.equal(f.prompts.get(PROMPT_KEY).value, '');
    await assert.rejects(app.actions.change('clock.advance', 2), /выключен/);
});
test('settings disable clears prompt and prohibits all write actions', async () => {
    const f = fixture(); const app = createApp(f.getContext, () => {});
    app.actions.setting('inject', false); assert.equal(f.prompts.get(PROMPT_KEY).value, '');
    app.actions.setting('enabled', false);
    await assert.rejects(app.actions.save(), /выключен/);
    await assert.rejects(app.actions.import(JSON.stringify(createState('c'))), /выключен/);
    app.stop();
});

test('import and restore render busy/save status immediately, not a stale completed-save label', async () => {
    const f = fixture(); const statuses = []; let finish;
    const app = createApp(f.getContext, view => statuses.push(view?.store.status));
    await app.actions.save();
    f.setSave(() => new Promise(resolve => { finish = resolve; }));
    const pending = app.actions.import(JSON.stringify(createState('imported')));
    assert.equal(statuses.at(-1), 'Сохранение…'); assert.equal(app.store.busy, true);
    finish(); await pending;
    assert.match(statuses.at(-1), /Передано/);
    const restored = app.actions.restore();
    assert.equal(statuses.at(-1), 'Сохранение…');
    finish(); await restored;
    assert.match(statuses.at(-1), /Передано/); app.stop();
});
