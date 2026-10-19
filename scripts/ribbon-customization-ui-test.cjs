const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const net = require('node:net');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { inspect, electronExpression } = require('./electron-main-helper.cjs');
const { ribbonPage, overlayPage } = require('./shell-overlay-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `ribbon-customization-ui-${Date.now()}`);
const portable =
  process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const appearanceOnly = process.argv.includes('--appearance-only');
const marker = path.join(profile, 'command-executions.txt');
const customMarker = path.join(profile, 'custom-executions.txt');
const customId = randomUUID();
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
settings.updates.checkHostOnStartup = false;
settings.updates.checkAppletsOnStartup = false;
settings.ribbon.order = ['group:colored', 'separator:test', 'logs', 'settings'];
settings.ribbon.separators = ['separator:test'];
settings.ribbon.groups = [
  {
    id: 'group:colored',
    title: 'Color fixture',
    icon: 'folder',
    expansion: 'persistent',
    color: '#D249A1',
    children: ['home'],
  },
];
fs.mkdirSync(profile, { recursive: true });
if (!appearanceOnly) {
  const fixture = path.join(profile, 'extensions', 'ribbon-action');
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture.ribbon-action',
      name: 'Command fixture',
      version: '1.0.0',
      runtime: 'node',
      entry: 'worker.cjs',
      commands: [{ id: 'fixture.ribbon-action.run', title: 'Fixture action', automation: true }],
    }),
  );
  fs.writeFileSync(
    path.join(fixture, 'worker.cjs'),
    `exports.activate=async c=>{c.commands.register('fixture.ribbon-action.run','Fixture action',()=>require('node:fs').appendFileSync(${JSON.stringify(marker)},'run\\n'));};`,
  );
  settings.extensions['fixture.ribbon-action'] = { enabled: true, settings: {} };
  settings.customCommands = {
    version: 2,
    items: [
      {
        id: customId,
        title: 'Fixture process',
        description: '',
        typeId: 'appdock.process.start',
        owner: { kind: 'host' },
        configVersion: 1,
        config: {
          mode: 'executable',
          executable: process.execPath,
          arguments: [
            '-e',
            `require('node:fs').appendFileSync(${JSON.stringify(customMarker)},'custom\\n')`,
          ],
          workingDirectory: '',
          showConsole: false,
        },
        enabled: true,
        automation: false,
      },
    ],
  };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
let exe = require('electron');
if (portable) {
  exe = path.join(profile, 'AppDock.at365.exe');
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [];
let app, host, rail;
const until = async (fn, label) => {
  const end = Date.now() + 60000;
  let error;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      error = String(e);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label + (error ? ': ' + error : ''));
};
const saved = (fn) =>
  until(
    async () => fn((await host.evaluate(() => window.dock.snapshot())).settings.value.ribbon),
    'saved ribbon',
  );
const button = (id) => rail.locator(`[data-ribbon-id="${id}"]`);
const port = async () => {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
};
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: exe,
      args: [root, `--test-profile=${profile}`],
      env,
    });
  else {
    const debug = await port(),
      inspector = await port();
    const child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'portable CDP',
    );
    const context = browser.contexts()[0];
    app = {
      context: () => context,
      firstWindow: () =>
        until(
          () => context.pages().find((p) => p.url().startsWith('appdock://host/index.html')),
          'host',
        ),
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      close: async () => {
        if (child.exitCode === null) {
          await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
          await until(() => child.exitCode !== null, 'portable shutdown');
        }
        await browser.close();
      },
    };
  }
  host = await app.firstWindow();
  host.setDefaultTimeout(15000);
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  rail = await ribbonPage(host);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 820));
  await button('group:colored').waitFor();
}
async function openRibbonSettings() {
  await button('settings').click();
  const page = await settingsPage(host);
  await page
    .locator('.settings-categories')
    .getByRole('button', { name: 'リボン', exact: true })
    .click();
  await page.locator('.ribbon-settings').waitFor();
  return page;
}
async function colorGeometry() {
  return rail.locator('.ribbon-group').evaluate((group) => {
    const button = group.querySelector('button'),
      children = group.querySelector('.ribbon-children');
    const rect = button.getBoundingClientRect();
    const bar = getComputedStyle(button, ':after');
    const childRect = children?.getBoundingClientRect();
    const bridge = children && getComputedStyle(children, ':before');
    return {
      shadow: getComputedStyle(button).boxShadow,
      bar: {
        color: bar.backgroundColor,
        width: parseFloat(bar.width),
        height: parseFloat(bar.height),
        left: rect.left + parseFloat(bar.left),
        top: rect.top + parseFloat(bar.top),
      },
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      line: children && getComputedStyle(children).borderLeftColor,
      lineLeft: childRect?.left,
      bridge: bridge?.backgroundColor,
      bridgeTop: childRect && childRect.top + parseFloat(bridge.top),
      bridgeBottom: childRect && childRect.top + parseFloat(bridge.top) + parseFloat(bridge.height),
      lineTop: childRect?.top,
    };
  });
}
(async () => {
  try {
    await launch();
    await button('group:colored').click();
    await button('home').waitFor();
    const initial = await colorGeometry();
    assert.equal(initial.shadow, 'none');
    assert.equal(initial.bar.color, 'rgb(210, 73, 161)');
    assert.equal(initial.bar.width, 2);
    assert.equal(initial.bar.height, initial.height);
    assert.equal(initial.bar.left, initial.left);
    assert.equal(initial.line, 'rgb(210, 73, 161)');
    assert.equal(initial.bridge, initial.line);
    assert.equal(initial.bar.color, initial.line);
    assert(Math.abs(initial.bridgeTop - initial.bottom) < 1);
    assert(Math.abs(initial.bridgeBottom - initial.lineTop) < 1);
    assert(Math.abs(initial.lineLeft - initial.left) < 1);
    await rail.screenshot({ path: path.join(profile, 'colored-expanded.png') });
    await button('group:colored').click();
    await button('home').waitFor({ state: 'hidden' });
    const collapsed = await colorGeometry();
    assert.deepEqual(collapsed.bar, initial.bar);
    assert.equal(collapsed.shadow, 'none');
    await rail.screenshot({ path: path.join(profile, 'colored-collapsed.png') });
    for (const expansion of ['temporary', 'persistent']) {
      await host.evaluate(async (expansion) => {
        const s = await window.dock.snapshot();
        s.settings.value.ribbon.groups[0].expansion = expansion;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, expansion);
      await until(
        async () =>
          (await button('group:colored').getAttribute('aria-haspopup')) ===
          (expansion === 'temporary' ? 'dialog' : null),
        expansion + ' group rendered',
      );
      const appearance = await colorGeometry();
      assert.deepEqual(appearance.bar, initial.bar);
      assert.equal(appearance.shadow, 'none');
      if (expansion === 'temporary')
        await rail.screenshot({ path: path.join(profile, 'colored-temporary.png') });
    }
    await button('group:colored').click();
    await button('home').waitFor();
    const page = await openRibbonSettings();
    await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'リボングループを編集', exact: true })
      .screenshot({ path: path.join(profile, 'group-editor.png') });
    const picker = page.locator('.settings-color-picker');
    const paletteName = picker.locator('.settings-color-palette-name');
    const cycle = picker.getByRole('button', { name: 'パレットを切り替え', exact: true });
    const hex = page.getByLabel('色のHEX値', { exact: true });
    const expectHex = (value) =>
      until(async () => (await hex.inputValue()) === value, 'color input updated to ' + value);
    for (const expansion of ['temporary', 'persistent']) {
      await page.getByLabel('展開方法', { exact: true }).selectOption(expansion);
      assert.equal(await page.getByLabel('展開方法', { exact: true }).inputValue(), expansion);
      assert.equal(
        await page
          .getByText('リボン内に展開します。開閉状態はこのPCで再起動後も保持します。', {
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText(
            '右側のパネルに1行で表示します。ボタンの実行・外側クリック・Escapeで閉じます。',
            { exact: true },
          )
          .count(),
        0,
      );
    }
    assert.equal(await paletteName.textContent(), 'パステル');
    assert.equal(
      await picker.getByRole('group', { name: '色見本' }).getByRole('button').count(),
      8,
    );
    assert.equal(await picker.getByText('自由な色', { exact: true }).count(), 0);
    assert.equal(await picker.getByText('HEX', { exact: true }).count(), 0);
    assert.equal(await picker.getByText('6桁のHEX値を指定できます。', { exact: true }).count(), 0);
    assert.equal(await page.getByLabel('グループの色のプレビュー', { exact: true }).count(), 0);
    assert.equal(await picker.locator('.settings-color-error').count(), 0);
    await page.getByLabel('色のHEX値', { exact: true }).fill('#12');
    assert.equal(await page.getByRole('button', { name: '適用', exact: true }).isEnabled(), false);
    assert.equal((await saved((r) => r.groups[0])).color, '#D249A1');
    await page.getByLabel('色のHEX値', { exact: true }).press('Escape');
    assert.equal(await page.getByLabel('色のHEX値', { exact: true }).inputValue(), '#D249A1');
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByLabel('色のHEX値', { exact: true }).fill('#aabbcc');
    await page.getByLabel('色のHEX値', { exact: true }).press('Escape');
    assert.equal(await page.getByLabel('色のHEX値', { exact: true }).inputValue(), '#D249A1');
    assert.equal((await saved((r) => r.groups[0])).color, '#D249A1');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
    await cycle.click();
    assert.equal(await paletteName.textContent(), 'くすみ');
    await cycle.press('Enter');
    assert.equal(await paletteName.textContent(), 'ベーシック');
    assert.equal(
      await picker.getByRole('button', { name: '青', exact: true }).getAttribute('title'),
      '青 #3B82F6',
    );
    await cycle.press('Space');
    assert.equal(await paletteName.textContent(), 'パステル');
    await expectHex('#D249A1');
    assert.equal((await saved((r) => r.groups[0])).color, '#D249A1');
    await page.getByLabel('自由な色', { exact: true }).fill('#789abc');
    await expectHex('#789ABC');
    assert.equal((await saved((r) => r.groups[0])).color, '#D249A1');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
    assert.equal(await paletteName.textContent(), 'パステル');
    await expectHex('#D249A1');
    await hex.fill('#12');
    await cycle.click();
    assert.equal(await paletteName.textContent(), 'くすみ');
    await expectHex('#12');
    assert.equal(await hex.getAttribute('aria-invalid'), 'true');
    assert.equal(await picker.locator('.settings-color-custom.is-invalid').count(), 1);
    assert.equal(await picker.locator('small').count(), 0);
    assert.equal(await page.getByRole('button', { name: '適用', exact: true }).isEnabled(), false);
    await picker.getByRole('button', { name: '青', exact: true }).press('Space');
    await expectHex('#91ABC9');
    assert.equal(await picker.locator('.settings-color-error').count(), 0);
    assert.equal(await page.getByRole('button', { name: '適用', exact: true }).isEnabled(), true);
    await picker.getByRole('button', { name: '色なし', exact: true }).click();
    await expectHex('');
    await cycle.click();
    await cycle.click();
    assert.equal(await paletteName.textContent(), 'パステル');
    assert.equal(
      await picker
        .getByRole('button', { name: '色なし', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await picker.getByRole('button', { name: '青', exact: true }).press('Enter');
    await expectHex('#A9C9ED');
    assert.equal(
      await picker.getByRole('button', { name: '青', exact: true }).getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await picker.getByRole('button', { name: '青', exact: true }).locator('svg').count(),
      1,
    );
    assert.equal((await saved((r) => r.groups[0])).color, '#D249A1');
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.groups[0].color === '#A9C9ED');
    await until(
      async () => (await colorGeometry()).line === 'rgb(169, 201, 237)',
      'pastel blue line',
    );
    checks.push(
      'Pastel default, three palette cycle with keyboard, native custom color, invalid input preservation, no labels/preview and selection without early save',
    );
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        async () =>
          (await rail.locator('html').getAttribute('data-theme')) === theme &&
          (await rail.locator('.activity-rail').evaluate((el) => getComputedStyle(el).backgroundColor)) ===
            (theme === 'dark' ? 'rgb(12, 13, 17)' : 'rgb(237, 240, 244)'),
        'ribbon theme rendered',
      );
      await rail.screenshot({ path: path.join(profile, `group-${theme}.png`) });
      await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
      await until(
        async () => (await page.locator('html').getAttribute('data-theme')) === theme,
        'editor theme applied',
      );
      for (const width of [900, 1120]) {
        await app.evaluate(
          ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 820),
          width,
        );
        const geometry = await picker.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const swatch = element.querySelector('.settings-color-swatch').getBoundingClientRect();
          const custom = element.querySelector('.settings-color-custom').getBoundingClientRect();
          const native = element.querySelector('input[type="color"]').getBoundingClientRect();
          const input = element.querySelector('input[type="text"]').getBoundingClientRect();
          return {
            overflow: element.scrollWidth > element.clientWidth,
            fits: [...element.querySelectorAll('button, input')].every((control) => {
              const child = control.getBoundingClientRect();
              return child.left >= rect.left && child.right <= rect.right;
            }),
            round: Math.abs(swatch.width - swatch.height) < 1,
            aligned: Math.abs(native.top + native.height / 2 - (input.top + input.height / 2)) < 1,
            nativeWidth: native.width,
            hexWidth: input.width,
            customHeight: custom.height,
          };
        });
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.fits, true);
        assert.equal(geometry.round, true);
        assert.equal(geometry.aligned, true);
        assert.equal(geometry.nativeWidth, 24);
        assert(geometry.hexWidth >= 100);
        assert.equal(geometry.customHeight, 36);
        await picker.screenshot({ path: path.join(profile, `color-picker-${theme}-${width}.png`) });
      }
      await page
        .getByRole('dialog', { name: 'リボングループを編集', exact: true })
        .screenshot({ path: path.join(profile, `group-editor-${theme}.png`) });
      const pickerHeight = (await picker.boundingBox()).height;
      await hex.fill('#12');
      await until(
        async () => (await hex.getAttribute('aria-invalid')) === 'true',
        'invalid color rendered',
      );
      const errorColors = await picker.locator('.settings-color-custom').evaluate((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderColor, focus: style.outlineColor };
      });
      const red = theme === 'dark' ? 'rgb(229, 138, 155)' : 'rgb(194, 59, 83)';
      assert.equal(errorColors.border, red);
      assert.equal(errorColors.focus, red);
      assert.equal((await picker.boundingBox()).height, pickerHeight);
      assert.equal(await picker.locator('small').count(), 0);
      assert.equal(
        await page.getByRole('button', { name: '適用', exact: true }).isEnabled(),
        false,
      );
      await picker.screenshot({ path: path.join(profile, `color-picker-${theme}-invalid.png`) });
      await hex.press('Tab');
      assert.equal(await picker.locator('.settings-color-custom.is-invalid').count(), 1);
      await picker.getByRole('button', { name: '青', exact: true }).press('Enter');
      await expectHex('#A9C9ED');
      assert.equal(await picker.locator('.settings-color-custom.is-invalid').count(), 0);
      assert.equal(await page.getByRole('button', { name: '適用', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 820));
    checks.push(
      'Round swatches, selected check, no overflow at 900/1120 widths and red invalid border/focus without text or layout movement in light/dark',
    );
    await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
    await page.getByRole('button', { name: '色なし', exact: true }).click();
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.groups[0].color === null);
    await until(async () => (await colorGeometry()).line === 'rgba(0, 0, 0, 0)', 'no color');
    const none = await colorGeometry();
    assert.equal(none.bar.color, 'rgba(0, 0, 0, 0)');
    assert.equal(none.shadow, 'none');
    assert.equal(none.width, initial.width);
    assert.equal(none.left, initial.left);
    checks.push(
      'Left-only full-height color bar in expanded/collapsed persistent and temporary groups; continuous same-color bridge/child line; theme rendering, invalid HEX and cancellation, no-color without layout movement',
    );
    await page.getByRole('button', { name: 'セパレーター 1を編集', exact: true }).click();
    await page.getByLabel('名前', { exact: true }).fill('Work separator');
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.separatorTitles['separator:test'] === 'Work separator');
    await until(
      async () => (await button('separator:test').getAttribute('aria-label')) === 'Work separator',
      'renamed separator rendered',
    );
    assert.equal(await button('separator:test').getAttribute('aria-label'), 'Work separator');
    await app.close();
    app = undefined;
    await launch();
    assert.equal(await button('separator:test').getAttribute('aria-label'), 'Work separator');
    assert.equal(await button('group:colored').getAttribute('aria-expanded'), 'true');
    assert.equal((await colorGeometry()).line, 'rgba(0, 0, 0, 0)');
    checks.push('Renamed separator and no-color/persistent expansion survive real host restart');
    if (!appearanceOnly) await commandChecks();
    assert.deepEqual(errors, []);
    const runtime = await app.evaluate(({ app, BrowserWindow }) => {
      const read = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const bytes = read('fs').readFileSync(
        read('path').join(app.getAppPath(), 'out/shells/default/extension.json'),
      );
      return {
        version: app.getVersion(),
        defaultShellVersion: JSON.parse(bytes).version,
        shellManifestSha256: read('crypto').createHash('sha256').update(bytes).digest('hex'),
        windowSize: BrowserWindow.getAllWindows()[0].getSize(),
      };
    });
    assert.equal(runtime.version, runtime.defaultShellVersion);
    await app.close();
    app = undefined;
    const result = {
      ok: true,
      checks,
      profile,
      portable,
      appearanceOnly,
      executableSha256: portable ? hash(exe) : null,
      errors,
      stopped: true,
      runtime,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, error: String(error), errors }, null, 2),
    );
    console.error(error);
    console.error('Evidence: ' + profile);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
  }
})();

async function commandChecks() {
  const executions = () =>
    fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split('run').length - 1 : 0;
  const choose = async (id) => {
    const palette = await overlayPage(host);
    await palette.getByRole('combobox', { name: 'コマンドを検索' }).fill(id);
    await palette.locator(`[data-command-id="${id}"] .palette-execute`).click();
  };
  await until(
    async () =>
      (await host.evaluate(() => window.dock.snapshot())).extensions.find(
        (e) => e.id === 'fixture.ribbon-action',
      )?.state === 'running',
    'command provider ready',
  );
  let page = await openRibbonSettings();
  const cards = page.locator('.ribbon-settings > .settings-section');
  assert.equal(await cards.count(), 2);
  assert.equal(await cards.first().evaluate((e) => e.tagName === 'DETAILS' && !e.open), true);
  assert.equal(await cards.first().locator('h2').textContent(), '動作設定');
  assert.equal(await cards.nth(1).locator('h2').textContent(), 'リボン編集');
  const create = async (title, target) => {
    await page.getByRole('button', { name: '上寄せにコマンドボタンを追加', exact: true }).click();
    await page.getByLabel('ボタン名', { exact: true }).fill(title);
    await page.getByRole('button', { name: '実行コマンドを選択', exact: true }).click();
    await choose(target);
    await page.getByRole('dialog', { name: 'コマンドボタンを追加', exact: true }).waitFor();
    assert.equal(await page.getByLabel('ボタン名', { exact: true }).inputValue(), title);
    await page.getByLabel('ボタンのアイコン', { exact: true }).selectOption('clock');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    const value = await saved((r) => r.buttons.find((b) => b.title === title));
    await button(value.id).waitFor();
    return value.id;
  };
  const run = await create('Run fixture', 'fixture.ribbon-action.run');
  assert.equal(executions(), 0, 'selecting and saving do not execute');
  await button(run).click();
  await until(() => executions() === 1, 'applet effect');
  const custom = await create('Custom launch', `appdock.custom.${customId}`);
  assert(!fs.existsSync(customMarker));
  await button(custom).click();
  await until(() => fs.existsSync(customMarker), 'custom process effect');
  const builtin = await create('Built-in logs', 'appdock.logs.open');
  await button(builtin).click();
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).navigation.route === 'logs',
    'builtin navigation',
  );
  page = await openRibbonSettings();
  await page.getByRole('button', { name: 'Run fixtureを編集', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'コマンドボタンを編集', exact: true })
    .screenshot({ path: path.join(profile, 'command-button-editor.png') });
  await page.getByLabel('ボタン名', { exact: true }).fill('Renamed action');
  await page.getByLabel('リボンにアイコンのみを表示する', { exact: true }).check();
  await page.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.buttons.find((b) => b.id === run)?.title === 'Renamed action');
  await page.getByLabel('Renamed actionの配置', { exact: true }).selectOption('group:colored');
  await saved((r) => r.groups[0].children.includes(run));
  await button(run).click();
  await until(() => executions() === 2, 'persistent command');
  await page.getByRole('button', { name: 'Color fixtureを編集', exact: true }).click();
  await page.getByLabel('展開方法', { exact: true }).selectOption('temporary');
  await page.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.groups[0].expansion === 'temporary');
  await button('group:colored').click();
  const flyout = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().endsWith('/overlay.html')),
    'group popup',
  );
  await flyout.getByRole('button', { name: 'Renamed action', exact: true }).click();
  await until(() => executions() === 3, 'temporary command');
  await until(
    async () =>
      !(await rail.evaluate(() => window.appdockShell.get())).items.find(
        (i) => i.id === 'group:colored',
      )?.expanded,
    'temporary popup closed',
  );
  checks.push(
    'UI add/edit/icon-only, preserved draft during command picker, builtin/Applet/custom execution and both group modes',
  );
  await cards.first().locator('summary').click();
  await page.getByRole('button', { name: '右クリックのコマンドを選択', exact: true }).click();
  await choose('fixture.ribbon-action.run');
  await saved((r) => r.rightClickCommand === 'fixture.ribbon-action.run');
  await page.screenshot({ path: path.join(profile, 'behavior-settings.png') });
  await rail.locator('.brand-mark').click({ button: 'right' });
  await until(() => executions() === 4, 'background right-click');
  await button('separator:test').click({ button: 'right' });
  await until(() => executions() === 5, 'separator right-click once');
  await app.close();
  app = undefined;
  await launch();
  await saved(
    (r) =>
      r.buttons.some((b) => b.id === run && b.title === 'Renamed action') &&
      r.rightClickCommand === 'fixture.ribbon-action.run',
  );
  await until(
    async () => (await rail.evaluate(() => window.appdockShell.get())).contextActionEnabled,
    'restored provider',
  );
  await rail.locator('.brand-mark').click({ button: 'right' });
  await until(() => executions() === 6, 'restored right-click');
  await host.evaluate(async () => {
    const s = await window.dock.snapshot();
    const value = s.settings.value;
    await window.dock.saveSettings(
      {
        ...value,
        extensions: {
          ...value.extensions,
          'fixture.ribbon-action': { ...value.extensions['fixture.ribbon-action'], enabled: false },
        },
      },
      s.settings.revision,
    );
  });
  await until(
    async () =>
      (await rail.evaluate(() => window.appdockShell.get())).contextActionEnabled === false,
    'stopped command disabled',
  );
  const denied = await rail.evaluate(async () => {
    const m = await window.appdockShell.get();
    try {
      await window.appdockShell.invoke({
        epoch: m.epoch,
        actionId: m.contextActionId,
        requestId: crypto.randomUUID(),
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(denied, true);
  assert.equal(executions(), 6);
  page = await openRibbonSettings();
  await page.getByRole('button', { name: 'リボンを初期状態に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'リボンを初期状態に戻す', exact: true })
    .getByRole('button', { name: '初期状態に戻す', exact: true })
    .click();
  await saved(
    (r) =>
      !r.buttons.length &&
      !r.groups.length &&
      !r.separators.length &&
      r.rightClickCommand === 'fixture.ribbon-action.run',
  );
  assert.equal(executions(), 6);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 680));
  await page.getByRole('heading', { name: '動作設定', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(profile, 'ribbon-settings-narrow.png') });
  checks.push(
    'Right-click assignment and command definitions survive restart; stopped provider cannot run; reset preserves behavior assignment',
  );
}
