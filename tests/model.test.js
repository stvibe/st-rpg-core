import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, validateState, decodeState, parseGameTime, playerView, buildPrompt, hearingAccess, clone } from '../src/model.js';
const apply = (state, type, value, module, id = `event-${state.revision}`) => transition(state, { id, type, value, module, expectedRevision: state.revision });
test('new state has every module, unknown rules and no invented game date', () => {
    const state = validateState(createState('campaign'));
    assert.equal(Object.keys(state.modules).length, 10);
    assert.equal(state.clock.iso, null); assert.equal(state.modules.hearing.left.battery, null);
    assert.equal(state.modules.skills.rules, null); assert.equal(state.modules.physiology.rules, null);
    assert.deepEqual(decodeState(JSON.stringify(state)), state);
});
test('clock requires explicit initial time, advances deterministically across leap day and does not mutate input', () => {
    const initial = createState('c');
    assert.throws(() => apply(initial, 'clock.advance', 1), /Сначала/);
    const set = apply(initial, 'clock.set', '2024-02-28T23:30');
    const result = apply(set, 'clock.advance', 60);
    assert.equal(result.clock.iso, '2024-02-29T00:30:00.000Z');
    assert.equal(result.clock.elapsedMinutes, 60); assert.equal(set.clock.elapsedMinutes, 0);
    assert.equal(initial.clock.iso, null);
    assert.deepEqual(apply(set, 'clock.advance', 60), result);
});
test('invalid clock values and overflow are rejected without state changes', () => {
    for (const date of ['2023-02-29T12:00', '2025-02-30T00:00', '0000-01-01T00:00', '2026-01-01', '2025-01-01T24:00']) assert.throws(() => parseGameTime(date));
    const state = apply(createState('c'), 'clock.set', '9999-12-31T23:59');
    for (const minutes of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER, 1]) assert.throws(() => apply(state, 'clock.advance', minutes));
    assert.equal(state.clock.elapsedMinutes, 0);
});
test('duplicate command ID is a no-op even when revision is stale; different stale command fails', () => {
    const state = apply(createState('c'), 'clock.set', '2026-01-01T00:00', undefined, 'once');
    assert.equal(transition(state, { id: 'once', type: 'clock.advance', value: 30, expectedRevision: 0 }), state);
    assert.throws(() => transition(state, { id: 'new', type: 'clock.advance', value: 30, expectedRevision: 0 }), /изменилось/);
});
test('unknown schema, prototype keys, deep or oversized imports fail closed', () => {
    const state = createState('c'); state.schemaVersion = 99;
    assert.throws(() => decodeState(JSON.stringify(state)), /версия/);
    assert.throws(() => decodeState('{"__proto__":{"polluted":true}}'));
    const huge = createState('c'); huge.private.worldFacts = Array(200).fill('x'.repeat(10_000));
    assert.throws(() => decodeState(JSON.stringify(huge)), /большой/);
    const polluted = JSON.stringify(createState('c')).replace('"npcKnowledge":{}', '"npcKnowledge":{"__proto__":{}}');
    assert.throws(() => decodeState(polluted), /ключ/);
    const deep = createState('c'); let node = deep.private.npcKnowledge;
    for (let i = 0; i < 20; i++) { node.next = {}; node = node.next; }
    assert.throws(() => decodeState(JSON.stringify(deep)), /глубокая/);
    assert.equal({}.polluted, undefined);
});
test('module schema rejects unknown shapes, duplicate IDs and unconfirmed public records', () => {
    const state = createState('c');
    assert.throws(() => apply(state, 'module', { items: [{ id: 'secret' }] }, 'inventory'), /knownToPlayer/);
    assert.throws(() => apply(state, 'module', { items: [{ id: 'x', knownToPlayer: true }, { id: 'x', knownToPlayer: true }] }, 'inventory'), /Повтор/);
    assert.throws(() => apply(state, 'module', { other: [] }, 'inventory'));
    const saved = apply(state, 'module', { items: [{ id: 'keys', knownToPlayer: true, quantity: 1, location: 'home' }] }, 'inventory');
    const later = apply(apply(saved, 'clock.set', '2026-01-01T00:00'), 'clock.advance', 120);
    assert.deepEqual(later.modules.inventory, saved.modules.inventory); // no invented consumption or travel
});
test('hearing schema enforces integer 0..5 and percentages; null stays unknown', () => {
    const state = createState('c');
    assert.deepEqual(hearingAccess(state.modules.hearing), [null, null]);
    for (const quality of [-1, 1.5, 6]) {
        const hearing = clone(state.modules.hearing); hearing.quality = quality;
        assert.throws(() => apply(state, 'module', hearing, 'hearing'));
    }
    for (const [key, value] of [['battery', 0], ['worn', false], ['charging', true], ['connected', false], ['operational', false]]) {
        const hearing = clone(state.modules.hearing);
        hearing.left[key] = value; hearing.right[key] = value;
        assert.deepEqual(hearingAccess(hearing), [false, false]);
        const blocked = apply(state, 'module', hearing, 'hearing');
        assert.match(buildPrompt(blocked), /Слух через оба процессора недоступен/);
    }
});
test('player projection and prompt exclude world truth and NPC knowledge; returned snapshot cannot mutate state', () => {
    const state = createState('c');
    state.private.worldFacts.push('SECRET_WORLD'); state.private.npcKnowledge.vivi = ['SECRET_NPC'];
    const view = playerView(state); view.player.name = 'changed';
    assert.equal(state.player.name, 'Элис'); assert.equal(view.private, undefined);
    const prompt = buildPrompt(state);
    assert.doesNotMatch(prompt, /SECRET_WORLD|SECRET_NPC|npcKnowledge|campaignId|appliedEventIds/);
    assert.match(prompt, /Элис управляется только игроком/);
});
test('oversized context omits modules explicitly while retaining current time and hearing constraints', () => {
    const state = createState('c');
    state.modules.inventory.items = Array.from({length: 20}, (_, i) => ({ id: String(i), knownToPlayer: true, description: 'x'.repeat(900) }));
    state.clock.iso = parseGameTime('2026-01-01T00:00');
    assert.match(buildPrompt(state), /omittedModules/); assert.match(buildPrompt(state), /2026-01-01/);
    assert.ok(buildPrompt(state).length < 12000);
});
