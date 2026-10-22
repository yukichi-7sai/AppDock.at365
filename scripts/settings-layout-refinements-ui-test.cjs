const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-layout-refinements-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [],
  measurements = [];
let app, page;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(label);
}
function contrast(a, b) {
  const luminance = (css) => {
    const [r, g, b] = css
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((v) => {
        const s = Number(v) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(profile, name + '.png') });
}
async function fields(container, narrow) {
  const rows = await container.locator('.settings-field').evaluateAll((elements) =>
    elements
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const rect = (element) => element?.getBoundingClientRect().toJSON();
        return {
          title: e.querySelector('legend').textContent,
          display: getComputedStyle(e).display,
          field: rect(e),
          label: rect(e.querySelector('.settings-field-label')),
          control: rect(e.querySelector('.settings-field-control')),
          group: rect(e.querySelector('.settings-field-group')),
          titleRect: rect(e.querySelector('.settings-title-with-hint > strong')),
          wide: e.classList.contains('settings-field-wide'),
          border: getComputedStyle(e).borderBottomWidth,
        };
      }),
  );
  for (const row of rows) {
    assert.equal(row.display, 'grid', row.title + ' uses the common grid');
    if (row.control) {
      if (narrow || row.wide)
        assert(row.control.y >= row.label.y + row.label.height - 1, row.title + ' stacks');
      else
        assert(
          row.control.x >= row.label.x + row.label.width + 10,
          row.title + ' has a value column',
        );
    }
    if (row.group) {
      assert(row.group.x + row.group.width <= row.titleRect.x, row.title + ' group beside title');
      assert(
        Math.abs(row.group.y + row.group.height / 2 - row.titleRect.y - row.titleRect.height / 2) <
          1,
        row.title + ' keeps the title height',
      );
      assert(row.titleRect.y - row.label.y < 12, row.title + ' has no extra group row');
    }
  }
  measurements.push({ type: 'fields', narrow, rows });
  return rows;
}
async function centered(button) {
  const value = await button.evaluate((e) => {
    const b = e.getBoundingClientRect(),
      l = e.querySelector('.settings-action-label').getBoundingClientRect();
    return { label: e.textContent, offset: l.x + l.width / 2 - b.x - b.width / 2 };
  });
  measurements.push({ type: 'button', ...value });
  assert(Math.abs(value.offset) < 0.75, value.label + ' is centered: ' + value.offset);
}
(async () => {
  let success = false;
  try {
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.host.hardwareAcceleration = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    const portable = !!process.argv[2],
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      fs.copyFileSync(path.resolve(process.argv[2]), executablePath);
      assert.equal(hash(executablePath), hash(path.resolve(process.argv[2])));
    }
    app = await launchTestHost({
      executablePath,
      portable,
      env,
      args: [
        ...(portable ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
    });
    await until(async () => {
      page = app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/'));
      return page && (await page.evaluate(() => window.dock?.snapshot()))?.startupReady;
    }, 'host startup');
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(page);
    const select = async (name) => {
      await page.locator('.settings-categories').getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
      await settleSettings(page);
    };
    for (const theme of ['light', 'dark']) {
      await select('表示');
      await page.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(page);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      for (const width of [1280, 760]) {
        await app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
              .setSize(width, 950),
          width,
        );
        for (const name of ['マウスジェスチャー', 'ショートカットキー']) {
          await select(name);
          const options = page
            .locator('details.settings-section')
            .filter({ has: page.getByRole('heading', { name: '動作設定', exact: true }) });
          if (!(await options.evaluate((e) => e.open)))
            await options.locator(':scope > summary').click();
          assert.equal(
            await options.locator('.settings-section').count(),
            0,
            name + ' has no nested sections',
          );
          const narrow = await page
            .locator('.settings-page-layout')
            .evaluate((e) => e.clientWidth <= 660);
          const rows = await fields(options, narrow);
          const browserRows = rows.filter((r) => r.title.startsWith('Webブラウザ：'));
          assert.equal(browserRows.length, 2);
          if (name === 'マウスジェスチャー') {
            assert.equal(rows.filter((r) => r.title.startsWith('操作感：')).length, 2);
            assert.equal(rows.filter((r) => r.title.startsWith('待機表示：')).length, 3);
          }
          assert(
            rows.every((r) => Math.abs(r.field.width - rows[0].field.width) < 1),
            'separators span the same full row',
          );
          assert(
            rows.slice(0, -1).every((r) => parseFloat(r.border) > 0),
            'all preceding rows have separators',
          );
          await options.scrollIntoViewIfNeeded();
          await screenshot(`${theme}-${width}-${name}`);
        }
        await select('通知');
        const notifications = page.locator('.notification-settings');
        const ownerCards = notifications.locator(':scope > [aria-label$="の通知"]');
        assert((await ownerCards.count()) > 0);
        for (const ownerCard of await ownerCards.all()) {
          const layout = await ownerCard.evaluate((e) => {
            const style = getComputedStyle(e);
            const rows = [...e.querySelectorAll('.notification-setting-card')].map((card) =>
              card.getBoundingClientRect(),
            );
            return {
              border: parseFloat(style.borderTopWidth),
              radius: parseFloat(style.borderRadius),
              background: style.backgroundColor,
              gaps: rows.slice(1).map((row, index) => row.top - rows[index].bottom),
            };
          });
          assert(
            layout.border > 0 && layout.radius >= 10 && layout.background !== 'rgba(0, 0, 0, 0)',
            'notification owner is a surfaced card',
          );
          assert(
            layout.gaps.every((gap) => gap >= 16),
            'notification rows keep their spacing inside the owner card',
          );
          measurements.push({ type: 'notification-owner', theme, width, ...layout });
        }
        for (const name of ['読み上げ', 'MCP Event']) {
          const card = notifications
            .locator(':scope > .settings-section')
            .filter({ has: page.getByRole('heading', { name, exact: true }) });
          if (!(await card.evaluate((e) => e.open))) await card.locator(':scope > summary').click();
          await fields(
            card,
            await page.locator('.settings-page-layout').evaluate((e) => e.clientWidth <= 660),
          );
          await card.scrollIntoViewIfNeeded();
          await screenshot(`${theme}-${width}-notification-${name.replaceAll(' ', '-')}`);
        }
        const cards = await notifications
          .locator('.notification-setting-card')
          .evaluateAll((elements) =>
            elements.map((e) => ({
              border: getComputedStyle(e).borderTopWidth,
              radius: parseFloat(getComputedStyle(e).borderRadius),
              background: getComputedStyle(e).backgroundColor,
              borderColor: getComputedStyle(e).borderColor,
            })),
          );
        assert(cards.length >= 2);
        for (const card of cards) {
          assert(parseFloat(card.border) > 0, 'card has a visible border');
          assert(
            card.radius >= 10 && card.background !== 'rgba(0, 0, 0, 0)',
            'notification is a surfaced card',
          );
          if (theme === 'dark')
            assert(contrast(card.borderColor, card.background) >= 2, 'dark card border is visible');
        }
        measurements.push({ type: 'cards', theme, width, cards });
        const errorCard = notifications
          .locator('.notification-setting-card')
          .filter({ has: page.getByRole('heading', { name: 'エラー通知', exact: true }) });
        if (!(await errorCard.evaluate((e) => e.open)))
          await errorCard.locator(':scope > summary').click();
        assert(await errorCard.getByLabel('エラー通知のバナー', { exact: true }).isDisabled());
        await fields(
          errorCard,
          await page.locator('.settings-page-layout').evaluate((e) => e.clientWidth <= 660),
        );
        await errorCard.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-notification-card`);
        await select('操作の許可');
        const publication = page.getByRole('region', { name: 'APIの公開', exact: true });
        assert.equal(
          await publication
            .locator(':scope > .settings-section-content > .permission-table')
            .count(),
          1,
        );
        const publicationStyle = await publication.evaluate((e) => ({
          border: parseFloat(getComputedStyle(e).borderTopWidth),
          radius: parseFloat(getComputedStyle(e).borderRadius),
        }));
        assert(
          publicationStyle.border > 0 && publicationStyle.radius >= 10,
          'API publication table is wrapped in a card',
        );
        const background = await page.locator('.permission-table').evaluate((e) => {
          const sample = document.createElement('span');
          sample.style.background = 'var(--panel)';
          e.append(sample);
          const result = {
            table: getComputedStyle(e).backgroundColor,
            card: getComputedStyle(sample).backgroundColor,
          };
          sample.remove();
          return result;
        });
        assert.equal(background.table, background.card, 'permissions use the card background');
        await screenshot(`${theme}-${width}-permissions`);
        await select('MCPサーバー');
        const group = page.getByRole('region', { name: '認証の設定例', exact: true });
        const spacing = await group.evaluate(
          (e) =>
            e.querySelector('header').getBoundingClientRect().top - e.getBoundingClientRect().top,
        );
        assert(spacing >= 16, 'unframed section heading has top spacing');
        measurements.push({ type: 'section-group-spacing', theme, width, spacing });
        await group.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-section-group`);
        if (portable) {
          await select('Applet管理');
          await page.getByRole('button', { name: 'Appletをインストール', exact: true }).click();
          const dialog = page.getByRole('dialog');
          const sourceField = dialog.getByRole('group', { name: '配布元', exact: true });
          assert.equal(
            await sourceField.locator('.settings-field-label strong').innerText(),
            '配布元',
          );
          assert.equal(
            await sourceField.locator('.settings-field-label p').innerText(),
            'URLまたはフォルダー',
          );
          await centered(
            dialog.getByRole('button', { name: 'インストールして再起動', exact: true }),
          );
          await screenshot(`${theme}-${width}-install`);
          await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        }
        await select('AI');
        const before = await page.evaluate(
          async () => (await window.dock.snapshot()).settings.value.ai,
        );
        await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
        const dialog = page.getByRole('dialog');
        assert.equal(
          await dialog.locator('.settings-section, details').count(),
          0,
          'AI settings are flat',
        );
        assert.equal(await dialog.locator('.settings-dialog-fields > .settings-field').count(), 11);
        await fields(dialog, await dialog.evaluate((e) => e.clientWidth - 48 <= 520));
        await centered(dialog.getByRole('button', { name: 'OK', exact: true }));
        await screenshot(`${theme}-${width}-ai-top`);
        await dialog.getByLabel('AIの保存指定', { exact: true }).scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-ai-options`);
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        assert.deepEqual(
          await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
          before,
          'cancel keeps saved AI settings',
        );
        assert.equal(
          await page.locator('.settings-body').evaluate((e) => e.scrollWidth > e.clientWidth + 2),
          false,
        );
        checks.push(
          `${theme} ${width}: fields, full separators, group captions, notification cards, permissions, flat AI and centered actions`,
        );
      }
    }
    await select('AI');
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    let aiDialog = page.getByRole('dialog');
    const savedBefore = await page.evaluate(
      async () => (await window.dock.snapshot()).settings.value.ai,
    );
    await aiDialog.getByLabel('AI接続の名前', { exact: true }).fill('Layout probe');
    await aiDialog.getByLabel('AIのAPIのURL', { exact: true }).fill('http://127.0.0.1:1/v1');
    await aiDialog.getByLabel('AIの既定の出力トークン上限', { exact: true }).fill('16384');
    await aiDialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).fill('120');
    assert.deepEqual(
      await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
      savedBefore,
      'AI edits stay local until OK',
    );
    await aiDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await aiDialog.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai);
    const connection = saved.connections.find((c) => c.name === 'Layout probe');
    assert.equal(connection.defaultMaxOutputTokens, 16384);
    assert.equal(connection.defaultTimeoutSeconds, 120);
    assert.equal(connection.baseUrl, 'http://127.0.0.1:1/v1');
    await page.getByRole('button', { name: 'Layout probeの設定', exact: true }).click();
    aiDialog = page.getByRole('dialog');
    assert.equal(
      await aiDialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).inputValue(),
      '120',
    );
    await aiDialog.getByLabel('AIのTemperature', { exact: true }).fill('0.7');
    await aiDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.deepEqual(
      await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
      saved,
    );
    checks.push(
      'flat AI fields retain local drafts, persist limits on OK and discard edits on cancel',
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.showHints.off'));
    await settleSettings(page);
    await select('マウスジェスチャー');
    const options = page
      .locator('details.settings-section')
      .filter({ has: page.getByRole('heading', { name: '動作設定', exact: true }) });
    await options.locator(':scope > summary').click();
    assert.equal(await options.locator('.settings-field-group').count(), 7);
    assert.equal(await page.locator('.settings-hint-icon').count(), 0);
    checks.push(
      'group context stays visible with hints off; saved values and required notification targets are preserved',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    if (page) await screenshot('failure').catch(() => {});
  } finally {
    if (app)
      await app.close().catch((error) => {
        errors.push(error.message);
        success = false;
        process.exitCode = 1;
      });
    const result = {
      success,
      checks,
      errors,
      profile,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(
      path.join(profile, 'measurements.json'),
      JSON.stringify(measurements, null, 2),
    );
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
