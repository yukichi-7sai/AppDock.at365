const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { settingsItemId } = require('../out/main/shared/settings-catalog');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `setting-actions-ui-${Date.now()}`);
const id = 'fixture.field-actions',
  command = `${id}.apply`;
const fixture = path.join(profile, 'extensions', id);
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id,
    name: 'Field actions fixture',
    version: '1.0.0',
    minimumHostVersion: '0.105.8',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['settings', 'commands'],
    commands: [
      { id: command, title: '結合操作' },
      { id: `${id}.standalone`, title: '独立操作' },
      { id: `${id}.below`, title: '下の操作' },
      { id: `${id}.icon`, title: '更新操作' },
    ],
    settings: [{ key: 'text', title: '入力値', type: 'string', default: '', automation: true }],
    settingActions: [
      { command, title: '結合操作', settingKey: 'text', description: '入力値を使って試験します。' },
      { command: `${id}.standalone`, title: '独立操作' },
      {
        command: `${id}.below`,
        title: '下の操作',
        settingKey: 'text',
        placement: 'below',
        appearance: 'filled',
        icon: 'folder',
      },
      {
        command: `${id}.icon`,
        title: '更新操作',
        settingKey: 'text',
        placement: 'inline',
        icon: 'refresh',
        iconOnly: true,
      },
    ],
    settingSections: [{ id: 'details', title: '詳細設定', settings: ['text'], collapsible: true }],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `
const fs=require('node:fs'),path=require('node:path');
exports.activate=async c=>{
  c.commands.register('${command}','結合操作',async()=>{
    const text=c.settings.get('text','');
    fs.appendFileSync(path.join(__dirname,'calls.jsonl'),JSON.stringify({text})+'\\n');
    await new Promise(resolve=>{const timer=setInterval(()=>{if(fs.existsSync(path.join(__dirname,'release'))){clearInterval(timer);resolve();}},30);});
    if(text==='fail')throw Error('fixture action failed');
  });
  c.commands.register('${id}.standalone','独立操作',()=>{});
  for(const kind of ['below','icon']) c.commands.register('${id}.'+kind,kind,()=>{
    fs.appendFileSync(path.join(__dirname,'presentations.jsonl'),JSON.stringify({kind})+'\\n');
  });
};`,
);
const config = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(config.host, {
  theme: 'light',
  soundEnabled: false,
  closeToTray: false,
  checkUpdatesOnStartup: false,
});
config.keybindings = [];
config.globalShortcutCommands = [];
config.gestures.enabled = false;
config.touchpadGestures.enabled = false;
config.extensions[id] = { enabled: true, settings: { privateValue: 'keep' } };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(config));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let executable = require('electron');
const portable = !!process.argv[2];
if (portable) {
  executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const checks = [];
const calls = () =>
  fs.existsSync(path.join(fixture, 'calls.jsonl'))
    ? fs.readFileSync(path.join(fixture, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    : [];
(async () => {
  try {
    app = await launchTestHost({
      executablePath: executable,
      portable,
      args: [...(portable ? [] : [root]), `--test-profile=${profile}`],
      env,
    });
    const deadline = Date.now() + 30000;
    while (!page && Date.now() < deadline) {
      page = app
        .context()
        .pages()
        .find((p) => p.url() === 'appdock://host/index.html');
      if (!page) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(page, 'host page ready');
    await waitForHost(
      page,
      async (id) =>
        (await window.dock.snapshot()).extensions.find((a) => a.id === id)?.state === 'running',
      id,
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(page);
    await page.getByTestId(`settings-nav:applet:${id}`).click();
    await page.getByText('詳細設定', { exact: true }).click();
    const field = page.getByRole('group', { name: '入力値', exact: true });
    const input = field.getByLabel('入力値', { exact: true });
    const button = field.getByRole('button', { name: '結合操作', exact: true });
    const below = field.getByRole('button', { name: '下の操作', exact: true });
    const icon = field.getByRole('button', { name: '更新操作', exact: true });
    const standalone = page
      .getByRole('group', { name: '独立操作', exact: true })
      .getByRole('button', { name: '独立操作', exact: true });
    await button.waitFor();
    assert.equal(await page.getByRole('button', { name: '結合操作', exact: true }).count(), 1);
    assert.equal(await field.locator(':scope > .settings-field-label [data-mcp-lock]').count(), 0);
    assert.equal(await field.locator('[data-mcp-lock=unsupported]').count(), 3);
    assert.equal(await icon.getAttribute('title'), '更新操作');
    assert.equal((await icon.textContent()).trim(), '');
    assert.equal(await icon.locator('svg').count(), 1);
    assert.equal(await below.locator('svg').count(), 1);
    await below.press('Enter');
    await waitForHost(
      page,
      () => !document.querySelector('[aria-busy=true].settings-action-button'),
    );
    await icon.press('Space');
    await waitForHost(
      page,
      () => !document.querySelector('[aria-busy=true].settings-action-button'),
    );
    assert.deepEqual(
      fs
        .readFileSync(path.join(fixture, 'presentations.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse),
      [{ kind: 'below' }, { kind: 'icon' }],
    );
    checks.push(
      'text with icon and icon-only actions have accessible titles and execute by keyboard',
    );
    checks.push(
      'same field; old standalone layout retained; separate MCP identities for public input and unsupported action',
    );
    await input.fill('saved before action');
    await button.click();
    await page.waitForFunction(() =>
      document.querySelector('[aria-busy=true].settings-action-button'),
    );
    assert(await button.isDisabled());
    assert(await standalone.isDisabled());
    assert(await below.isDisabled());
    assert(await icon.isDisabled());
    await button.evaluate((el) => el.click());
    fs.writeFileSync(path.join(fixture, 'release'), '');
    await button.waitFor({ state: 'visible' });
    await waitForHost(
      page,
      () => !document.querySelector('[aria-busy=true].settings-action-button'),
    );
    assert.deepEqual(calls(), [{ text: 'saved before action' }]);
    checks.push(
      'input flushed before action; attached and standalone buttons disabled while pending; double execution blocked',
    );
    await input.fill('cancelled');
    await input.press('Escape');
    assert.equal(await input.inputValue(), 'saved before action');
    await input.fill('fail');
    await input.press('Tab');
    await button.press('Enter');
    await page.getByRole('alert').filter({ hasText: 'fixture action failed' }).waitFor();
    assert.equal(await field.getAttribute('data-invalid'), 'true');
    assert.equal(await input.inputValue(), 'fail');
    assert.equal(calls().length, 2);
    checks.push(
      'Escape cancels input; keyboard action failure targets its field and preserves saved input',
    );
    const search = page.getByRole('combobox', { name: '設定を検索' });
    await search.fill('結合操作');
    await page.getByRole('option').filter({ hasText: '結合操作' }).click();
    const anchor = settingsItemId(`applet:${id}`, `action:${command}`);
    await waitForHost(
      page,
      (anchor) => {
        const target = document.querySelector(`[data-setting-item="${anchor}"]`);
        return (
          target && (target === document.activeElement || target.contains(document.activeElement))
        );
      },
      anchor,
    );
    checks.push('settings search keeps the action anchor inside the parent field');
    await search.fill('');
    for (const width of [1200, 760]) {
      await page.setViewportSize({ width, height: 850 });
      await field.scrollIntoViewIfNeeded();
      const box = await field.boundingBox();
      for (const target of [input, button, below, icon]) {
        const rect = await target.boundingBox();
        assert(rect && rect.x >= box.x && rect.x + rect.width <= box.x + box.width + 1);
      }
      const inputBox = await input.boundingBox(),
        belowBox = await below.boundingBox();
      assert(
        belowBox.y >= inputBox.y + inputBox.height,
        'below action starts under input at both widths',
      );
      await page.screenshot({ path: path.join(profile, `field-${width}.png`) });
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        const { value, revision } = (await window.dock.snapshot()).settings;
        await window.dock.saveSettings({ ...value, host: { ...value.host, theme } }, revision);
      }, theme);
      await waitForHost(page, (theme) => document.documentElement.dataset.theme === theme, theme);
      const colors = await below.evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--raised)';
        el.append(probe);
        const result = {
          actual: getComputedStyle(el).backgroundColor,
          expected: getComputedStyle(probe).backgroundColor,
          text: getComputedStyle(el).color,
        };
        probe.remove();
        return result;
      });
      assert.equal(
        colors.actual,
        colors.expected,
        `${theme} filled appearance follows shared surface`,
      );
      assert.notEqual(colors.actual, colors.text);
      await page.screenshot({ path: path.join(profile, `field-${theme}.png`) });
    }
    checks.push('below placement at wide/narrow widths; filled surface follows light/dark themes');
    await page.evaluate((id) => window.dock.toggleExtension(id, false), id);
    await waitForHost(
      page,
      async (id) => !(await window.dock.snapshot()).extensions.find((a) => a.id === id).enabled,
      id,
    );
    await waitForHost(page, () =>
      Array.from(document.querySelectorAll('.settings-action-button'))
        .filter((button) => ['結合操作', '独立操作'].includes(button.textContent.trim()))
        .every((button) => button.disabled),
    );
    assert(await button.isDisabled());
    assert(await standalone.isDisabled());
    checks.push(
      'wide/narrow controls remain reachable; disabled Applet disables both forms without starting it',
    );
    await app.close();
    app = undefined;
    const saved = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json')));
    assert.equal(saved.extensions[id].settings.text, 'fail');
    assert.equal(saved.extensions[id].settings.privateValue, 'keep');
    assert(!JSON.stringify(saved).includes('settingKey'));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success: true, checks, hostHash: hash(executable) }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    await app?.close().catch(() => {});
    console.error(error);
    process.exitCode = 1;
  }
})();
