const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

module.exports = async function ({
  host,
  select,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
}) {
  assert.equal((await snapshot()).version, require('../package.json').version);
  const sharedFile = path.join(profile, 'settings.json');
  const sharedBefore = fs.readFileSync(sharedFile, 'utf8');
  await select('表示');
  const language = host.getByTestId('host-language');
  assert.equal(await language.getAttribute('aria-label'), '表示言語');
  assert.deepEqual(
    await language
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => [n.value, n.textContent])),
    [['ja', '日本語']],
  );
  assert.equal(
    await host
      .locator('.settings-form [data-setting-item]')
      .first()
      .getAttribute('data-setting-item'),
    'appearance/language',
  );
  await language.selectOption('ja');
  await settleSettings(host);
  checks.push('language is first in Appearance/Common with Japanese as the only option');

  const search = host.locator('.settings-search');
  await search.fill('日本語');
  await host.locator('#settings-results').getByText('表示言語', { exact: true }).click();
  await language.waitFor();
  await search.fill('');
  const hintToggle = host.locator('[data-setting-item="appearance/showHints"]').getByRole('switch');
  await hintToggle.click();
  await until(async () => !(await snapshot()).settings.value.host.showHints, 'hints off');
  await until(
    async () =>
      !(await host
        .locator('[data-setting-item="appearance/language"] .settings-hint-trigger')
        .count()),
    'hint removed',
  );
  await hintToggle.click();
  await until(async () => (await snapshot()).settings.value.host.showHints, 'hints on');
  checks.push('language is searchable and shared hint controls keep immediate-save behavior');

  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = host.getByRole('textbox', { name: '設定JSON', exact: true });
  await json.fill('{"host":{"language":"en"}}');
  await json.press('Tab');
  await until(
    async () => (await host.locator('.settings-status-area').innerText()).includes('host.language'),
    'invalid language error',
  );
  assert.equal((await snapshot()).settings.value.host.language, 'ja');
  assert.equal(await json.inputValue(), '{"host":{"language":"en"}}');
  await json.fill('{"host":{"language":"ja"}}');
  await json.press('Tab');
  await settleSettings(host);
  await host.getByRole('button', { name: 'フォーム', exact: true }).click();
  await language.waitFor();
  assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedBefore);
  checks.push(
    'invalid language stays in the editor without saving; valid language uses PC settings and preserves shared bytes',
  );

  for (const theme of ['light', 'dark']) {
    await select('表示');
    await host.locator('[data-setting-item="appearance/theme"] select').selectOption(theme);
    await until(
      () => host.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
      'theme applied',
    );
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].setSize(${width},1000)`,
      );
      await until(
        () =>
          host.evaluate(async () => {
            const connection =
              document.querySelector('.settings-surface').dataset.settingsConnection;
            return (
              (await window.dock.settingsPage.get(connection)).content.hostWidth ===
              window.innerWidth
            );
          }),
        'resized viewport model',
      );
      for (const [page, id] of [
        ['表示', 'appearance'],
        ['一般', 'general'],
      ]) {
        await select(page);
        const untranslated = await host.locator('.settings-body').evaluate(
          (body, keys) => {
            const known = new Set(keys),
              found = [];
            const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode.textContent.trim();
              if (known.has(text)) found.push(text);
            }
            return found;
          },
          Object.keys(require('../src/shared/locales/ja/host.json')),
        );
        assert.deepEqual(untranslated, []);
        assert.equal(
          await host.locator('.settings-body').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          true,
          `${page}/${theme}/${width} horizontal overflow`,
        );
        await host.screenshot({
          path: path.join(profile, `localization-${id}-${theme}-${width}.png`),
        });
      }
    }
  }
  await select('一般');
  const sound = host.locator('[data-setting-item="general/soundEnabled"]').getByRole('switch');
  const beforeSound = (await snapshot()).settings.value.host.soundEnabled;
  await sound.click();
  await until(
    async () => (await snapshot()).settings.value.host.soundEnabled !== beforeSound,
    'general setting save',
  );
  await sound.click();
  await settleSettings(host);
  checks.push(
    'appearance and general render without raw translation keys or horizontal overflow at 1280/760 in light/dark; General toggle saves',
  );

  await select('カスタムコマンド');
  assert.ok(await host.getByText('language.ja $t(language.ja)', { exact: true }).count());
  await select('リボン');
  assert.ok(await host.getByText('pages.general.title {{name}}', { exact: true }).count());
  const saved = (await snapshot()).settings.value;
  assert.equal(saved.customCommands.items[0].title, 'language.ja $t(language.ja)');
  assert.equal(saved.ribbon.groups[0].title, 'pages.general.title {{name}}');
  checks.push(
    'user custom command and ribbon group names display and persist verbatim, including key-like text',
  );
};
