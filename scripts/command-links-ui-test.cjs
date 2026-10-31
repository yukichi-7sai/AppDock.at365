const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { overlayPage, overlayClosed } = require('./shell-overlay-helper.cjs');
const { assertReadableText } = require('./ui-usability-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `command-links-ui-${Date.now()}`);
const fixture = path.join(profile, 'extensions', 'fixture.links');
fs.mkdirSync(fixture, { recursive: true });
const target = 'fixture.links.run',
  title = 'ZZ リンク対象';
const tag = `[command:${target}]`;
const manifest = {
  apiVersion: 1,
  id: 'fixture.links',
  name: 'Command links fixture',
  version: '1.0.0',
  minimumHostVersion: '0.105.0',
  runtime: 'node',
  entry: 'worker.cjs',
  capabilities: ['commands', 'settings'],
  description: `概要 ${tag}、不明 [command:fixture.links.missing]、文字列 \\${tag} <b>plain</b>`,
  commands: [
    ...Array.from({ length: 120 }, (_, i) => ({
      id: `fixture.links.item${i}`,
      title: `Item ${String(i).padStart(3, '0')}`,
    })),
    { id: target, title },
  ],
  settings: [
    {
      key: 'text',
      title: 'テキスト値',
      type: 'string',
      default: 'initial',
      description: `入力後に ${tag}`,
    },
    { key: 'json', title: 'JSON値', type: 'json', default: '{}', description: `入力を保持 ${tag}` },
    {
      key: 'nested',
      title: '入れ子',
      type: 'object-list',
      itemTitle: 'インライン項目',
      default: [{ name: 'row' }],
      fields: [
        { key: 'name', title: '名前', type: 'string', default: '', description: `入れ子 ${tag}` },
      ],
    },
    {
      key: 'dialog',
      title: 'ダイアログ一覧',
      type: 'object-list',
      itemTitle: 'ダイアログ項目',
      default: [{ name: 'row' }],
      list: { columns: ['name'], titleKey: 'name' },
      fields: [
        {
          key: 'name',
          title: '名前',
          type: 'string',
          default: '',
          description: `ダイアログ ${tag}`,
        },
      ],
    },
  ],
  settingActions: [{ command: target, title: '試験操作', description: `操作の説明 ${tag}` }],
  settingSections: [
    {
      id: 'links',
      title: 'リンクの設定',
      description: `セクション ${tag}`,
      settings: ['text', 'json', 'nested', 'dialog'],
      actions: [target],
      collapsible: true,
      defaultOpen: true,
    },
  ],
};
fs.writeFileSync(path.join(fixture, 'extension.json'), JSON.stringify(manifest));
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `const fs=require('node:fs'),path=require('node:path');exports.activate=async c=>{c.commands.register('${target}','${title}',()=>fs.appendFileSync(path.join(__dirname,'executed.txt'),'run\\n'));};`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.soundEnabled = false;
settings.host.closeToTray = false;
settings.host.checkUpdatesOnStartup = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.touchpadGestures.enabled = false;
settings.extensions[manifest.id] = { enabled: true, settings: { privateValue: 'keep' } };
const winSource = 'A:/40.ARTIFACT/Applet.WindowsTools.at365/Applet.WindowsTools.at365';
const winFolder = path.join(profile, 'extensions', 'WindowsTools');
fs.cpSync(winSource, winFolder, { recursive: true });
const winManifest = JSON.parse(fs.readFileSync(path.join(winFolder, 'extension.json')));
settings.extensions[winManifest.id] = { enabled: false, settings: { autoLockEnabled: false } };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let executable = require('electron'),
  portable = !!process.argv[2];
if (portable) {
  executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
const checks = [];
let app, dock;
const executed = () =>
  fs.existsSync(path.join(fixture, 'executed.txt'))
    ? fs.readFileSync(path.join(fixture, 'executed.txt'), 'utf8').trim().split('\n').length
    : 0;
const link = () =>
  dock.getByRole('button', { name: `${title}をコマンドパレットで表示`, exact: true });
async function dismiss(p) {
  await p.getByRole('combobox').press('Escape');
  await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
  await p.locator('.command-palette').waitFor({ state: 'hidden' });
  assert(await overlayClosed(p));
}
async function selectApplet(id) {
  await dock.getByTestId(`settings-nav:applet:${id}`).click();
  await dock
    .getByRole('heading', {
      name: id === manifest.id ? manifest.name : winManifest.displayName,
      exact: true,
    })
    .waitFor();
}
(async () => {
  try {
    app = await launchTestHost({
      executablePath: executable,
      portable,
      args: [...(portable ? [] : [root]), `--test-profile=${profile}`],
      env,
    });
    const end = Date.now() + 30000;
    while (Date.now() < end && !dock) {
      dock = app
        .context()
        .pages()
        .find((p) => p.url() === 'appdock://host/index.html');
      if (!dock) await new Promise((r) => setTimeout(r, 50));
    }
    assert(dock, 'Host page');
    dock.setDefaultTimeout(15000);
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.show();
      w.focus();
    });
    await waitForHost(
      dock,
      async () =>
        (await window.dock.snapshot()).extensions.find((e) => e.id === 'fixture.links')?.state ===
        'running',
    );
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(dock);
    await selectApplet(manifest.id);
    await link().first().waitFor();
    assert.equal(
      await dock.getByText('不明なコマンド（fixture.links.missing）', { exact: true }).count(),
      1,
    );
    assert(
      (await dock.getByTestId('applet-description').textContent()).includes(
        '[command:fixture.links.run]',
      ),
    );
    assert((await dock.getByTestId('applet-description').textContent()).includes('<b>plain</b>'));
    assert.equal(await dock.getByTestId('applet-description').locator('b').count(), 0);
    await link().first().click();
    let p = await overlayPage(dock);
    const cached = p;
    const oldBinding = await p.evaluate(() => window.appdockPalette.connect());
    await p.locator(`[role=option][data-command-id="${target}"][aria-selected=true]`).waitFor();
    const filter = p.getByRole('combobox');
    assert.equal(await filter.inputValue(), target);
    assert.deepEqual(
      await filter.evaluate((input) => ({
        start: input.selectionStart,
        end: input.selectionEnd,
        focused: input === document.activeElement,
      })),
      { start: 0, end: target.length, focused: true },
    );
    assert.equal(await p.getByRole('option').count(), 1);
    assert.equal(executed(), 0);
    await p.waitForFunction((id) => {
      const el = document.querySelector(`[data-command-id="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect(),
        parent = el.parentElement.getBoundingClientRect();
      return r.top >= parent.top - 1 && r.bottom <= parent.bottom + 1;
    }, target);
    await p.screenshot({ path: path.join(profile, 'target-selected.png') });
    await filter.pressSequentially('Item 001');
    assert.equal(await filter.inputValue(), 'Item 001');
    await p.locator('[data-command-id="fixture.links.item1"][aria-selected=true]').waitFor();
    await p.getByRole('button', { name: 'Item 001をピン留め', exact: true }).click();
    await waitForHost(dock, async () =>
      (await window.dock.snapshot()).settings.value.pinnedCommands.includes('fixture.links.item1'),
    );
    assert.equal(await filter.inputValue(), 'Item 001');
    await filter.fill('');
    assert((await p.getByRole('option').count()) > 1);
    assert.equal(executed(), 0);
    await dismiss(p);
    assert.equal(
      await p.evaluate(() =>
        window.appdockPalette.connect().then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    await waitForHost(dock, () => document.activeElement?.classList.contains('command-link'));
    await link().first().press('Enter');
    p = await overlayPage(dock);
    assert.equal(p, cached);
    assert.equal(await p.getByRole('combobox').inputValue(), target);
    assert.equal(
      await p.evaluate(
        (id) =>
          window.appdockPalette.act({ id, type: 'dismiss' }).then(
            () => false,
            () => true,
          ),
        oldBinding.snapshot.id,
      ),
      true,
    );
    assert.equal(
      await p.evaluate(
        (binding) =>
          window.appdockPalette.ready(binding.sessionId, binding.snapshot.id).then(
            () => false,
            () => true,
          ),
        oldBinding,
      ),
      true,
    );
    await p.getByRole('combobox').press('Enter');
    await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
    assert.equal(executed(), 1);
    await dock.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    p = await overlayPage(dock);
    assert.equal(await p.getByRole('combobox').inputValue(), '');
    assert((await p.getByRole('option').count()) > 1);
    await dismiss(p);
    checks.push(
      'metadata tags, escape and unknown labels; ID filter selected for replacement; typing/clearing and pin updates; targeted reopen and ordinary empty search; keyboard execution once; Escape focus; cached surface',
    );
    const section = dock
      .locator('details')
      .filter({ has: dock.getByRole('heading', { name: 'リンクの設定', exact: true }) });
    if (!(await section.evaluate((el) => el.open))) await section.locator('summary').click();
    const opened = await section.evaluate((el) => el.open);
    await section
      .locator('summary')
      .getByRole('button', { name: `${title}をコマンドパレットで表示` })
      .click();
    p = await overlayPage(dock);
    await dismiss(p);
    assert.equal(await section.evaluate((el) => el.open), opened);
    await dock.getByLabel('テキスト値', { exact: true }).fill('saved before palette');
    await link().first().click();
    p = await overlayPage(dock);
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.extensions['fixture.links']
        .settings.text,
      'saved before palette',
    );
    await dismiss(p);
    assert.equal(
      await dock.getByLabel('テキスト値', { exact: true }).inputValue(),
      'saved before palette',
    );
    await dock.getByLabel('JSON値', { exact: true }).fill('{');
    await link().first().click();
    await dock
      .getByRole('alert')
      .filter({ hasText: /JSON|入力/ })
      .first()
      .waitFor();
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).overlay.active, false);
    assert.equal(await dock.getByLabel('JSON値', { exact: true }).inputValue(), '{');
    await dock.getByLabel('JSON値', { exact: true }).press('Escape');
    await dock.getByLabel('JSON値', { exact: true }).fill('{}');
    await dock.getByLabel('JSON値', { exact: true }).press('Tab');
    assert(
      (await section.getByRole('button', { name: `${title}をコマンドパレットで表示` }).count()) >=
        4,
    );
    await dock.getByRole('button', { name: 'ダイアログ項目を追加', exact: true }).click();
    const dialog = dock.getByRole('dialog');
    await dialog.getByRole('button', { name: `${title}をコマンドパレットで表示` }).click();
    p = await overlayPage(dock);
    await dismiss(p);
    await dialog.getByRole('button', { name: `${title}をコマンドパレットで表示` }).waitFor();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push(
      'section link does not collapse; input blur saves; invalid JSON stays visible without opening palette; nested fields and dialog descriptions',
    );
    await selectApplet(winManifest.id);
    const displayLink = dock.getByRole('button', {
      name: /ディスプレイの消灯を予約をコマンドパレットで表示/,
    });
    await displayLink.click();
    p = await overlayPage(dock);
    await p
      .locator(
        '[data-command-id="at365.windows-tools.display-off"][aria-selected=true] .palette-execute:disabled',
      )
      .waitFor();
    await p.getByRole('combobox').press('Enter');
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).overlay.active, true);
    await dismiss(p);
    await dock
      .getByRole('button', { name: /無操作時の自動ロック.*をコマンドパレットで表示/ })
      .waitFor();
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(winFolder, 'extension.json'))).version,
      winManifest.version,
    );
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.extensions[winManifest.id]
        .enabled,
      false,
    );
    checks.push(
      'published WindowsTools metadata renders both command links; stopped command opens selected but cannot execute or auto-start',
    );
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.unmaximize();
      w.setSize(900, 640);
    });
    for (const theme of ['light', 'dark']) {
      await dock.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await displayLink.click();
      p = await overlayPage(dock);
      await p.screenshot({ path: path.join(profile, `windows-tools-${theme}.png`) });
      assert.equal(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), theme);
      await assertReadableText(p.getByRole('combobox'));
      await assertReadableText(p.locator('.palette-execute').first());
      await dismiss(p);
      await dock.screenshot({ path: path.join(profile, `windows-tools-settings-${theme}.png`) });
    }
    checks.push('light/dark fixed palette at native 900x640; no horizontal overflow');
    await app.close();
    app = undefined;
    const saved = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json')));
    assert.equal(saved.extensions[manifest.id].settings.privateValue, 'keep');
    assert.equal(saved.extensions[manifest.id].settings.text, 'saved before palette');
    fs.writeFileSync(
      path.join(profile, 'checks.json'),
      JSON.stringify(
        { success: true, checks, hostHash: hash(executable), windowsTools: winManifest.version },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    if (dock)
      fs.writeFileSync(
        path.join(profile, 'failure-state.json'),
        JSON.stringify(
          await dock
            .evaluate(async () => ({
              hasFocus: document.hasFocus(),
              active: document.activeElement?.outerHTML,
              state: await window.dock.snapshot(),
            }))
            .catch(() => null),
          null,
          2,
        ),
      );
    await dock?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    await app?.close().catch(() => {});
    process.exitCode = 1;
  }
})();
