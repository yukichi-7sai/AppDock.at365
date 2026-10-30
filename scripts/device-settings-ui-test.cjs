const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const output = path.join(root, '.artifacts', `device-settings-ui-${Date.now()}`);
const base = path.join(output, 'profile'),
  local = path.join(output, 'local');
fs.mkdirSync(base, { recursive: true });
const value = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(value.host, { theme: 'light', soundEnabled: false, closeToTray: false });
value.gestures.enabled = false;
value.keybindings = [];
value.globalShortcutCommands = [];
value.extensions['example.device-settings'] = { enabled: false, settings: { interval: 60 } };
const sharedFile = path.join(base, 'settings.json');
const deviceFile = path.join(base, `settings-${os.hostname()}.json`);
fs.writeFileSync(sharedFile, JSON.stringify(value));
const folder = path.join(base, 'extensions', 'example');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(
  path.join(folder, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'example.device-settings',
    name: 'Device settings fixture',
    displayName: 'Device settings fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    startupDelaySeconds: 0,
    capabilities: ['settings'],
    commands: [{ id: 'example.device-settings.self-set', title: 'Set own interval' }],
    settings: [{ key: 'interval', title: '間隔（秒）', type: 'number', minimum: 1, default: 60 }],
  }),
);
fs.writeFileSync(
  path.join(folder, 'index.js'),
  'exports.activate = async context => { context.commands.register("example.device-settings.self-set", "Set own interval", () => context.settings.set("interval", 180)); };',
);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let executable = require('electron');
if (portable) {
  executable = path.join(base, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(portable, executable);
  assert.equal(hash(executable), hash(portable));
}
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error('Timed out: ' + label);
}
async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}
let running;
async function start() {
  const debug = await port(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'process.log'), 'a');
  const child = spawn(
    executable,
    [
      ...(portable ? [] : [root]),
      `--test-profile=${base}`,
      `--test-local-state=${local}`,
      `--remote-debugging-port=${debug}`,
    ],
    { cwd: base, env, windowsHide: true, stdio: ['ignore', log, log] },
  );
  fs.closeSync(log);
  running = { child };
  const browser = (running.browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
    'CDP',
  ));
  const host = (running.host = await until(
    () =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith('appdock://host/')),
    'host',
  ));
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  running.page = await settingsPage(host);
  await until(
    () => running.page.evaluate(() => innerWidth > 300 && innerHeight > 200),
    'visible settings viewport',
  );
  running.page.setDefaultTimeout(15000);
  await running.page.getByRole('button', { name: '表示', exact: true }).click();
  await running.page.getByTestId('settings-page:appearance').waitFor();
  return running;
}
async function stop() {
  if (!running) return;
  if (running.host)
    await running.host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => running.child.exitCode !== null, 'shutdown');
  await running.browser?.close().catch(() => {});
  running = undefined;
}
const checks = [];
(async () => {
  try {
    let state = await start(),
      page = state.page;
    const toggle = () => page.getByTestId('settings-storage-local');
    assert.equal(await toggle().isChecked(), true);
    assert.equal(await toggle().isDisabled(), true);
    await page.getByLabel('テーマ', { exact: true }).selectOption('dark');
    await settleSettings(state.host);
    await until(() => disk(deviceFile).host.theme === 'dark', 'local theme');
    assert.equal(
      require('../out/main/shared/settings-schema').parseSettings(disk(sharedFile)).host.theme,
      'light',
    );
    checks.push('appearance checked disabled; theme local');
    const reset = () => page.getByRole('button', { name: 'このページを既定値に戻す', exact: true });
    const dialog = () => page.getByRole('dialog');
    await reset().click();
    await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(disk(deviceFile).host.theme, 'dark');
    await reset().click();
    await dialog().getByRole('button', { name: '既定値に戻す', exact: true }).click();
    await until(() => disk(deviceFile).host.theme === undefined, 'default theme omitted');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    assert.deepEqual(
      JSON.parse(await page.getByRole('textbox', { name: '設定JSON' }).inputValue()),
      {},
    );
    assert.equal(
      (await state.host.evaluate(() => window.dock.snapshot())).settings.value.host.theme,
      'light',
    );
    checks.push(
      'form reset/cancel preserves scope; default JSON is empty and device keys are omitted',
    );
    await reset().click();
    await state.host.evaluate(async () => {
      const s = await window.dock.snapshot();
      const v = structuredClone(s.settings.value);
      v.host.theme = 'system';
      await window.dock.saveSettings(v, s.settings.revision);
    });
    await dialog().getByRole('button', { name: '既定値に戻す', exact: true }).click();
    await dialog().getByRole('alert').waitFor();
    assert.equal(disk(deviceFile).host.theme, 'system');
    await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await reset().click();
    await dialog().getByRole('button', { name: '既定値に戻す', exact: true }).click();
    await until(() => disk(deviceFile).host.theme === undefined, 'JSON reset');
    checks.push(
      'JSON reset rejects changes after confirmation and succeeds after fresh confirmation',
    );
    await page.getByRole('button', { name: '一般', exact: true }).click();
    await page.getByRole('heading', { name: '一般', exact: true }).waitFor();
    assert.equal(await toggle().isChecked(), true);
    assert.equal(await toggle().isDisabled(), true);
    const general = await page.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    assert.deepEqual(
      general.content.auxiliary.storage.files.map((file) => file.scope),
      ['device'],
    );
    checks.push('general checked disabled; JSON and file target device');
    const hostPages = [
      [
        'notifications',
        '通知',
        {
          host: { notificationBannerPosition: 'bottom-right', notificationBannerShadow: false },
          notificationPreferences: { overrides: [], speech: { voice: 'local-voice' } },
        },
      ],
      ['ribbon', 'リボン', { ribbon: { rightClickCommand: 'appdock.open' } }],
      ['statusbar', 'ステータスバー', { host: { showStatusBar: false } }],
      [
        'tray',
        'タスクトレイ',
        {
          trayMenu: [],
          host: {
            trayClickCommand: 'appdock.settings.open',
            trayDoubleClickCommand: 'appdock.open',
          },
        },
      ],
      ['about', 'AppDockについて', { updates: { startupDelaySeconds: 31 } }],
    ];
    const hostPageModel = () =>
      page.evaluate(() =>
        window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        ),
      );
    for (const [pageId, title, configuration] of hostPages) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await page.getByTestId(`settings-page:${pageId}`).waitFor();
      assert.equal(await toggle().isDisabled(), false);
      assert.equal(await toggle().isChecked(), ['notifications', 'statusbar'].includes(pageId));
      if (!(await toggle().isChecked())) await toggle().check();
      await until(
        () => disk(deviceFile).hostPages[pageId].useLocalSettings,
        pageId + ' local mode',
      );
      if (pageId === 'notifications')
        await page.screenshot({ path: path.join(output, 'host-notifications-local.png') });
      await page.getByRole('button', { name: 'JSON', exact: true }).click();
      const sharedBefore = fs.readFileSync(sharedFile, 'utf8');
      const input = page.getByRole('textbox', { name: '設定JSON', exact: true });
      await input.fill(JSON.stringify(configuration, null, 2));
      await input.press('Enter');
      await settleSettings(state.host);
      const local = JSON.parse(await input.inputValue());
      assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedBefore);
      assert.deepEqual(
        (await hostPageModel()).content.auxiliary.storage.files.map((file) => file.scope),
        ['device'],
      );
      assert(!/hostPages|machineName|useLocalSettings/.test(await input.inputValue()));
      await toggle().click();
      await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
      assert.equal(await toggle().isChecked(), true);
      await toggle().click();
      await dialog().getByRole('button', { name: '切り替える', exact: true }).click();
      await until(
        () => !disk(deviceFile).hostPages[pageId].useLocalSettings,
        pageId + ' shared keep',
      );
      assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedBefore);
      assert.deepEqual(
        (await hostPageModel()).content.auxiliary.storage.files.map((file) => file.scope),
        ['shared'],
      );
      await toggle().check();
      await until(
        async () => JSON.stringify(JSON.parse(await input.inputValue())) === JSON.stringify(local),
        pageId + ' local resume',
      );
      await toggle().click();
      await dialog()
        .getByRole('radio', { name: 'このPCの設定を共有設定に反映する', exact: true })
        .check();
      await dialog().getByRole('button', { name: '切り替える', exact: true }).click();
      await until(
        () => !disk(deviceFile).hostPages[pageId].useLocalSettings,
        pageId + ' shared copy',
      );
      assert.equal(disk(deviceFile).hostPages[pageId].configuration, undefined);
      assert.deepEqual(JSON.parse(await input.inputValue()), local);
      checks.push(
        pageId +
          ': local/shared toggle, isolated JSON save, cancel, keep/resume, share and file target',
      );
      await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    }
    await page.setViewportSize({ width: 720, height: 820 });
    assert.equal(await toggle().isVisible(), true);
    await page.screenshot({ path: path.join(output, 'host-about-shared-narrow.png') });
    await page.setViewportSize({ width: 1280, height: 842 });
    await stop();
    state = await start();
    page = state.page;
    for (const [pageId, title] of hostPages) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await page.getByTestId(`settings-page:${pageId}`).waitFor();
      assert.equal(await toggle().isChecked(), false);
      assert.deepEqual(
        (await hostPageModel()).content.auxiliary.storage.files.map((file) => file.scope),
        ['shared'],
      );
    }
    checks.push(
      'all five host page modes and file targets survive a real app restart; narrow toolbar remains accessible',
    );
    await page.getByRole('button', { name: 'Device settings fixture', exact: true }).click();
    await page.getByRole('heading', { name: 'Device settings fixture', exact: true }).waitFor();
    assert.equal(await toggle().isChecked(), false);
    assert.equal(await toggle().isDisabled(), false);
    await toggle().check();
    await until(
      () => disk(deviceFile).extensions['example.device-settings'].useLocalSettings,
      'local mode',
    );
    const scopedResult = await page.evaluate(async () => {
      const m = await window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      );
      return (
        await window.dock.settingsPage.act(
          document.querySelector('.settings-surface').dataset.settingsConnection,
          {
            id: m.id,
            type: 'settings',
            sessionId: m.content.editing.sessionId,
            editRevision: m.content.editing.editRevision,
            operationId: crypto.randomUUID(),
            operation: {
              kind: 'invoke',
              actionId: m.content.actions['set-local-settings'],
              args: [true, m.content.auxiliary.storage.revision],
            },
          },
        )
      ).result;
    });
    assert.deepEqual(Object.keys(scopedResult).sort(), ['revision', 'storage']);
    await page.getByLabel('間隔（秒）', { exact: true }).fill('120');
    await page.getByLabel('間隔（秒）', { exact: true }).press('Enter');
    await settleSettings(state.host);
    await until(
      () =>
        disk(deviceFile).extensions['example.device-settings'].configuration.settings.interval ===
        120,
      'local config',
    );
    assert.equal(
      disk(sharedFile).extensions['example.device-settings'].settings.interval ?? 60,
      60,
    );
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    let text = await page.getByRole('textbox', { name: '設定JSON', exact: true }).inputValue();
    assert.equal(JSON.parse(text).extensions['example.device-settings'].settings.interval, 120);
    let model = await page.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    assert.deepEqual(
      model.content.auxiliary.storage.files.map((file) => file.scope),
      ['device', 'shared'],
    );
    await toggle().click();
    await dialog().getByRole('button', { name: '切り替える', exact: true }).click();
    await until(
      () => !disk(deviceFile).extensions['example.device-settings'].useLocalSettings,
      'shared mode',
    );
    await until(
      async () =>
        Object.keys(JSON.parse(await page.getByRole('textbox', { name: '設定JSON' }).inputValue()))
          .length === 0,
      'shared JSON',
    );
    model = await page.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    assert.deepEqual(
      model.content.auxiliary.storage.files.map((file) => file.scope),
      ['shared'],
    );
    await toggle().check();
    await until(
      () => disk(deviceFile).extensions['example.device-settings'].useLocalSettings,
      'resume local',
    );
    checks.push(
      'Applet mode, form, JSON and file target switch together; saved local configuration resumes',
    );
    await reset().click();
    await dialog().getByRole('button', { name: '既定値に戻す', exact: true }).click();
    await until(
      () =>
        !Object.hasOwn(
          disk(deviceFile).extensions['example.device-settings'].configuration.settings,
          'interval',
        ),
      'local default key removed',
    );
    assert.deepEqual(
      JSON.parse(await page.getByRole('textbox', { name: '設定JSON' }).inputValue()),
      {},
    );
    assert.equal(
      disk(sharedFile).extensions['example.device-settings'].settings.interval ?? 60,
      60,
    );
    assert.equal(await toggle().isChecked(), true);
    checks.push('Applet reset clears only selected local configuration and retains local mode');
    const setInterval = async (value) => {
      await page.getByRole('button', { name: 'フォーム', exact: true }).click();
      await page.getByLabel('間隔（秒）', { exact: true }).fill(String(value));
      await page.getByLabel('間隔（秒）', { exact: true }).press('Enter');
      await settleSettings(state.host);
    };
    await setInterval(150);
    await toggle().click();
    await dialog()
      .getByRole('radio', { name: 'このPCの設定を共有設定に反映する', exact: true })
      .check();
    await page.screenshot({ path: path.join(output, 'storage-share-dialog.png') });
    await dialog().getByRole('button', { name: '切り替える', exact: true }).click();
    await until(
      () => disk(sharedFile).extensions['example.device-settings'].settings.interval === 150,
      'local settings shared',
    );
    assert.equal(disk(deviceFile).extensions['example.device-settings'].configuration, undefined);
    await toggle().check();
    await setInterval(180);
    await toggle().click();
    await dialog()
      .getByRole('radio', { name: 'このPCの設定を削除して共有設定に戻す', exact: true })
      .check();
    await dialog().getByRole('button', { name: '切り替える', exact: true }).click();
    await until(
      () => !disk(deviceFile).extensions['example.device-settings'].useLocalSettings,
      'clear and shared',
    );
    assert.equal(disk(deviceFile).extensions['example.device-settings'].configuration, undefined);
    assert.equal(await page.getByLabel('間隔（秒）', { exact: true }).inputValue(), '150');
    await toggle().check();
    await setInterval(60);
    assert.equal(
      disk(deviceFile).extensions['example.device-settings'].configuration.settings.interval,
      undefined,
    );
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    assert.deepEqual(
      JSON.parse(await page.getByRole('textbox', { name: '設定JSON' }).inputValue()),
      {},
    );
    checks.push(
      'share and clear choices persist correctly; form changes back to default omit JSON keys',
    );
    // Restore the following regression's input while retaining a different shared value.
    await setInterval(120);
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    await page.getByRole('textbox', { name: '設定JSON' }).fill('{broken');
    await page.getByRole('textbox', { name: '設定JSON' }).press('Enter');
    await page.getByRole('alert').first().waitFor();
    await toggle().click();
    await until(
      async () =>
        (await page.getByRole('alert').allTextContents()).some((text) => text.includes('入力')),
      'invalid input guard',
    );
    assert.equal(disk(deviceFile).extensions['example.device-settings'].useLocalSettings, true);
    await page.getByRole('button', { name: '設定を再読み込み', exact: true }).click();
    checks.push('invalid JSON cannot be transferred to another storage scope');
    await page.screenshot({ path: path.join(output, 'applet-json.png') });
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'applet-form.png') });
    await state.host.evaluate(async () => {
      const snapshot = await window.dock.snapshot();
      const next = structuredClone(snapshot.settings.value);
      next.host.theme = 'light';
      await window.dock.saveSettings(next, snapshot.settings.revision);
    });
    await page.screenshot({ path: path.join(output, 'applet-light.png') });
    const session = await state.host.context().newCDPSession(state.host);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 700,
      height: 780,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.screenshot({ path: path.join(output, 'applet-narrow.png') });
    await session.send('Emulation.clearDeviceMetricsOverride');
    await session.detach();
    checks.push('dark/light and emulated narrow settings screenshots');
    await stop();
    state = await start();
    page = state.page;
    await page.getByRole('button', { name: 'Device settings fixture', exact: true }).click();
    await page.getByRole('heading', { name: 'Device settings fixture', exact: true }).waitFor();
    assert.equal(await toggle().isChecked(), true);
    assert.equal(await page.getByLabel('間隔（秒）', { exact: true }).inputValue(), '120');
    const snapshot = await state.host.evaluate(() => window.dock.snapshot());
    assert.equal(
      snapshot.extensions.find((item) => item.id === 'example.device-settings').enabled,
      false,
    );
    checks.push('restart retains local mode/configuration without activating disabled Applet');
    await state.host.evaluate(() => window.dock.toggleExtension('example.device-settings', true));
    await until(
      async () =>
        (await state.host.evaluate(() => window.dock.snapshot())).extensions.find(
          (item) => item.id === 'example.device-settings',
        ).state === 'running',
      'Node fixture running',
    );
    await state.host.evaluate(() => window.dock.executeCommand('example.device-settings.self-set'));
    await until(
      () =>
        disk(deviceFile).extensions['example.device-settings'].configuration.settings.interval ===
        180,
      'Node self setting uses device store',
    );
    assert.equal(disk(sharedFile).extensions['example.device-settings'].settings.interval, 150);
    await state.host.evaluate(() => window.dock.toggleExtension('example.device-settings', false));
    checks.push('real Node Applet self-setting writes selected device configuration');
    await page.getByTestId('settings-nav:applets').click();
    await page
      .getByTestId('settings-page:applets')
      .getByRole('button', { name: 'Device settings fixture', exact: true })
      .click();
    page = await settingsPage(state.host);
    await until(
      () => page.evaluate(() => innerWidth > 300 && innerHeight > 200),
      'Applet settings viewport',
    );
    assert.equal(await page.getByTestId('settings-storage-local').isChecked(), true);
    assert.equal(await page.getByLabel('間隔（秒）', { exact: true }).inputValue(), '180');
    await page.screenshot({ path: path.join(output, 'detail-settings.png') });
    checks.push(
      'Applet management opens the same selected storage and values as the settings index',
    );
    await stop();
    const result = {
      passed: true,
      checks,
      portable: portable ? { path: portable, sha256: hash(portable) } : null,
      output,
    };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.txt'), String(error.stack));
    if (running?.page) {
      await running.page
        .evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          buttons: [...document.querySelectorAll('button')].slice(0, 25).map((element) => ({
            text: element.textContent,
            rect: element.getBoundingClientRect().toJSON(),
          })),
        }))
        .then((value) =>
          fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(value, null, 2)),
        )
        .catch(() => {});
      await running.page
        .screenshot({ path: path.join(output, 'failure.png'), timeout: 3000 })
        .catch((error) =>
          fs.writeFileSync(path.join(output, 'screenshot-error.txt'), String(error)),
        );
    }
    await stop().catch(() => {});
    throw error;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
