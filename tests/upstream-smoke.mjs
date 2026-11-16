/** Optional real-upstream smoke. Use a disposable ST data root, never a real campaign. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const target = process.env.ST_URL;
if (!target) throw new Error('Укажите ST_URL выделенного тестового SillyTavern с установленным расширением');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(target); await page.locator('#rpg-core-hud').waitFor({ timeout: 30000 });
    const names = { a: `rpg-smoke-A-${Date.now()}`, b: `rpg-smoke-B-${Date.now()}` };
    await page.evaluate(async name => {
        const context = SillyTavern.getContext();
        if (!context.characters.length) throw new Error('Нужна хотя бы одна тестовая карточка');
        await context.selectCharacterById(0); await SillyTavern.getContext().openCharacterChat(name);
    }, names.a);
    if (!(await page.locator('#rpg-core-body').isVisible())) await page.getByRole('button', {name:'RPG Core',exact:true}).click();
    const tab = async name => {
        if (!(await page.locator('#rpg-core-body').isVisible())) await page.getByRole('button', {name:'RPG Core',exact:true}).click();
        await page.getByRole('tab', { name, exact: true }).click();
    };
    const click = name => page.getByRole('button', { name, exact: true }).click();
    await tab('Календарь');
    await page.getByLabel('Игровая дата и время', { exact: false }).fill('2024-02-28T23:30');
    await click('Установить дату');
    await page.waitForFunction(() => document.querySelector('#rpg-core-hud [role=status]').textContent.includes('Передано'));
    await page.getByLabel('Таймскип в игровых минутах').fill('60'); await click('Применить таймскип');
    await page.waitForFunction(() => document.querySelector('#rpg-core-hud [role=status]').textContent.includes('Передано'));
    const withSecrets = await page.evaluate(() => structuredClone(SillyTavern.getContext().chatMetadata.rpgCore));
    withSecrets.private.worldFacts = ['SMOKE_PRIVATE_WORLD'];
    withSecrets.private.npcKnowledge.vivi = ['SMOKE_NPC_KNOWLEDGE'];
    await tab('Настройки'); page.once('dialog', dialog => dialog.accept());
    await page.getByLabel('Импорт полной копии', {exact:false}).setInputFiles({name:'smoke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(withSecrets))});
    await page.waitForFunction(() => SillyTavern.getContext().chatMetadata.rpgCore.private.worldFacts.includes('SMOKE_PRIVATE_WORLD'));
    await page.waitForFunction(() => document.querySelector('#rpg-core-hud [role=status]').textContent.includes('Передано'));
    const before = await page.evaluate(() => structuredClone(SillyTavern.getContext().chatMetadata.rpgCore));
    assert.equal(before.clock.iso, '2024-02-29T00:30:00.000Z'); assert.equal(before.clock.elapsedMinutes, 60);
    await page.reload(); await page.locator('#rpg-core-hud').waitFor({ timeout: 30000 });
    await page.evaluate(async name => { await SillyTavern.getContext().selectCharacterById(0); await SillyTavern.getContext().openCharacterChat(name); }, names.a);
    assert.deepEqual(await page.evaluate(() => SillyTavern.getContext().chatMetadata.rpgCore), before);
    await page.evaluate(name => SillyTavern.getContext().openCharacterChat(name), names.b);
    assert.match(await page.locator('.rpg-clock').textContent(), /не задана/);
    assert.doesNotMatch(await page.evaluate(() => SillyTavern.getContext().extensionPrompts['rpg-core-state-v1'].value), /2024-02-29/);
    await page.evaluate(name => SillyTavern.getContext().openCharacterChat(name), names.a);
    const after = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        for (const name of ['GENERATION_AFTER_COMMANDS', 'MESSAGE_SWIPED', 'GENERATION_STOPPED', 'GENERATION_ENDED']) await context.eventSource.emit(context.eventTypes[name], 'regenerate');
        return structuredClone(SillyTavern.getContext().chatMetadata.rpgCore);
    });
    assert.deepEqual(after, before);
    assert.match(await page.evaluate(() => SillyTavern.getContext().extensionPrompts['rpg-core-state-v1'].value), /2024-02-29T00:30/);
    const assembled = await page.evaluate(async () => {
        const context = SillyTavern.getContext(); let result;
        const handler = (data, dryRun) => { if (dryRun) result = data; };
        context.eventSource.on(context.eventTypes.GENERATE_AFTER_DATA, handler);
        try { await context.generate('normal', {}, true); } finally { context.eventSource.removeListener(context.eventTypes.GENERATE_AFTER_DATA, handler); }
        return JSON.stringify(result);
    });
    assert.match(assembled, /RPG Core v1/); assert.match(assembled, /2024-02-29T00:30/);
    assert.doesNotMatch(assembled, /SMOKE_PRIVATE_WORLD|SMOKE_NPC_KNOWLEDGE/);
    assert.doesNotMatch(await page.locator('#rpg-core-hud').textContent(), /SMOKE_PRIVATE_WORLD|SMOKE_NPC_KNOWLEDGE/);
    const groupId = await page.evaluate(async names => {
        const context = SillyTavern.getContext();
        const response = await fetch('/api/groups/create', {
            method: 'POST', headers: context.getRequestHeaders(),
            body: JSON.stringify({name:'RPG smoke', members:[context.characters[0].avatar], chat_id:names.a, chats:[names.a,names.b], disabled_members:[]}),
        });
        if (!response.ok) throw new Error('Не удалось создать тестовую группу');
        const group = await response.json();
        const module = await import('/scripts/group-chats.js');
        await module.getGroups(); await module.openGroupById(group.id);
        return group.id;
    }, names);
    assert.match(await page.locator('.rpg-clock').textContent(), /не задана/);
    await tab('Календарь');
    await page.getByLabel('Игровая дата и время', {exact:false}).fill('2030-01-02T12:00');
    await click('Установить дату');
    await page.waitForFunction(() => document.querySelector('#rpg-core-hud [role=status]').textContent.includes('Передано'));
    await page.evaluate(({id,name}) => SillyTavern.getContext().openGroupChat(id,name), {id:groupId,name:names.b});
    assert.match(await page.locator('.rpg-clock').textContent(), /не задана/);
    await page.evaluate(({id,name}) => SillyTavern.getContext().openGroupChat(id,name), {id:groupId,name:names.a});
    assert.equal(await page.evaluate(() => SillyTavern.getContext().chatMetadata.rpgCore.clock.iso), '2030-01-02T12:00:00.000Z');
    // Character and group deliberately use identical chat filenames: metadata must remain isolated.
    await page.evaluate(async name => { await SillyTavern.getContext().selectCharacterById(0); await SillyTavern.getContext().openCharacterChat(name); }, names.a);
    assert.deepEqual(await page.evaluate(() => SillyTavern.getContext().chatMetadata.rpgCore), before);
    assert.deepEqual(errors, []);
    console.log('PASS real ST: entry, clock/time skip, HTTP save/reload, character/group chat isolation including same filename, lifecycle no-op, assembled OpenAI dry-run prompt without private facts');
    if (process.env.RPG_SCREENSHOT) await page.screenshot({ path: process.env.RPG_SCREENSHOT });
} finally { await browser.close(); }
