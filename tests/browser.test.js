import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server, browser, base;
before(async () => {
    server = createServer(async (req, res) => {
        const path = resolve(root, `.${new URL(req.url, 'http://test').pathname}`);
        if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
        try {
            const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(path)] || 'application/json';
            const data = await readFile(path);
            res.writeHead(200, { 'Content-Type': type }); res.end(data);
        } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/tests/harness.html`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function pageForTest() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.locator('#rpg-core-hud').waitFor();
    if (!(await page.locator('#rpg-core-body').isVisible())) await page.getByRole('button', {name:'RPG Core',exact:true}).click();
    return { page, errors };
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
test('actual entry module renders all SPEC tabs, keyboard navigation, collapse and mobile sizing', async () => {
    const { page, errors } = await pageForTest();
    for (const name of ['Статус', 'Слух', 'Физиология', 'Устройства', 'Инвентарь', 'Навыки', 'Локации', 'Здоровье', 'Отношения', 'Календарь', 'Сюжеты', 'Журнал', 'Настройки']) {
        await tab(page, name); assert.equal(await page.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true');
    }
    await tab(page, 'Статус'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Слух', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home'); assert.equal(await page.getByRole('tab', {name:'Статус',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('End'); assert.equal(await page.getByRole('tab', {name:'Настройки',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('ArrowLeft'); assert.equal(await page.getByRole('tab', {name:'Журнал',exact:true}).getAttribute('aria-selected'),'true');
    await click(page, 'RPG Core'); assert.equal(await page.locator('#rpg-core-body').isVisible(), false);
    await click(page, 'RPG Core'); await page.setViewportSize({ width: 375, height: 667 });
    const box = await page.locator('#rpg-core-hud').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0);
    assert.doesNotMatch(await page.locator('#rpg-core-hud').textContent(), /SECRET_WORLD|SECRET_NPC/);
    assert.deepEqual(errors, []); await page.close();
});
test('calendar controls persist time across reload and isolate chats; generation lifecycle has no mutations', async () => {
    const { page, errors } = await pageForTest(); await tab(page, 'Календарь');
    await page.getByLabel('Игровая дата и время', { exact: false }).fill('2024-02-28T23:30'); await click(page, 'Установить дату');
    await page.getByLabel('Таймскип в игровых минутах').fill('60'); await click(page, 'Применить таймскип');
    await page.waitForFunction(() => harness.f.metadata.get('A').rpgCore.clock.elapsedMinutes === 60);
    assert.match(await page.evaluate(() => harness.getPrompt()), /2024-02-29T00:30/);
    await page.reload(); await page.locator('#rpg-core-hud').waitFor();
    assert.match(await page.locator('.rpg-clock').textContent(), /2024-02-29 00:30/);
    await page.evaluate(async () => {
        for (const event of ['GENERATION_AFTER_COMMANDS', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_STOPPED', 'GENERATION_ENDED']) await harness.emit(event, 'regenerate');
    });
    assert.equal(await page.evaluate(() => harness.f.metadata.get('A').rpgCore.clock.elapsedMinutes), 60);
    await page.evaluate(() => harness.switchTo('B'));
    assert.match(await page.locator('.rpg-clock').textContent(), /не задана/);
    assert.doesNotMatch(await page.evaluate(() => harness.getPrompt()), /2024-02-29/);
    await page.evaluate(() => harness.switchTo('A'));
    assert.match(await page.locator('.rpg-clock').textContent(), /2024-02-29/);
    assert.deepEqual(errors, []); await page.close();
});
test('module edits reject malformed input and render hostile content as text; secret state never injected', async () => {
    const { page, errors } = await pageForTest(); await tab(page, 'Инвентарь');
    await page.getByText('Изменить данные модуля (JSON)', {exact:true}).click();
    const editor = page.getByLabel('Данные: Инвентарь');
    await editor.fill('{bad'); await click(page, 'Сохранить модуль');
    assert.ok((await page.getByRole('alert').textContent()).length > 0);
    await editor.fill(JSON.stringify({ items: [{ id: 'keys', knownToPlayer: true, label: '<img src=x onerror="window.hacked=true">', quantity: 1 }] }));
    await click(page, 'Сохранить модуль');
    await page.waitForFunction(() => harness.f.metadata.get('A').rpgCore.modules.inventory.items.length === 1);
    assert.equal(await page.locator('#rpg-core-hud img').count(), 0);
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    assert.doesNotMatch(await page.evaluate(() => harness.getPrompt()), /SECRET_WORLD|SECRET_NPC/);
    assert.deepEqual(errors, []); await page.close();
});
test('entry disable/enable removes HUD and prompt, and settings can switch injection off', async () => {
    const { page, errors } = await pageForTest(); await tab(page, 'Настройки');
    await page.getByLabel('Передавать состояние в контекст ИИ').uncheck();
    assert.equal(await page.evaluate(() => harness.getPrompt()), '');
    await page.getByLabel('Передавать состояние в контекст ИИ').check();
    assert.ok((await page.evaluate(() => harness.getPrompt())).length > 0);
    assert.equal(await page.evaluate(() => harness.entry.API_VERSION), 1);
    assert.equal(await page.evaluate(() => harness.entry.getPlayerSnapshot().private), undefined);
    await page.evaluate(() => harness.entry.onDisable());
    assert.equal(await page.evaluate(() => harness.entry.getPlayerSnapshot()), null);
    assert.equal(await page.locator('#rpg-core-hud').count(), 0); assert.equal(await page.evaluate(() => harness.getPrompt()), '');
    await page.evaluate(() => harness.entry.onEnable()); await page.locator('#rpg-core-hud').waitFor();
    assert.equal(await page.locator('#rpg-core-hud').count(), 1);
    assert.deepEqual(errors, []); await page.close();
});
test('full import confirmation and restore update only the selected chat; invalid file leaves state unchanged', async () => {
    const { page, errors } = await pageForTest(); await tab(page, 'Настройки');
    page.on('dialog', dialog => dialog.accept());
    const old = await page.evaluate(() => structuredClone(harness.f.metadata.get('A').rpgCore));
    const imported = structuredClone(old); imported.player.name = 'Импорт'; imported.private.worldFacts = ['IMPORTED_SECRET'];
    await page.getByLabel('Импорт полной копии', { exact: false }).setInputFiles({name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))});
    await page.waitForFunction(() => harness.f.metadata.get('A').rpgCore.player.name === 'Импорт');
    assert.doesNotMatch(await page.evaluate(() => harness.getPrompt()), /IMPORTED_SECRET/);
    assert.equal(await page.evaluate(() => harness.f.metadata.get('B').rpgCore), undefined);
    await click(page, 'Восстановить предыдущую версию');
    await page.waitForFunction(() => harness.f.metadata.get('A').rpgCore.player.name === 'Элис');
    await page.getByLabel('Импорт полной копии', { exact: false }).setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad')});
    await page.waitForFunction(() => document.querySelector('[role=alert]').textContent.length > 0);
    assert.equal(await page.evaluate(() => harness.f.metadata.get('A').rpgCore.player.name), 'Элис');
    assert.deepEqual(errors, []); await page.close();
});
