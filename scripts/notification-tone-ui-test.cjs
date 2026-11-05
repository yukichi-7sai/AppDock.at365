const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/notification-tone-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
const checks = [],
  errors = [],
  requests = [];
const id = 'fixture.notification-tone';
let host,
  page,
  server,
  success = false;
const snapshot = () => page.evaluate(() => window.dock.snapshot());
const preferences = async () =>
  (await snapshot()).settings.value.notificationPreferences ?? { overrides: [] };
const execute = (command) =>
  page.evaluate((command) => window.dock.executeCommand(command), command);
const section = () => page.getByTestId('notification-sound');
const picker = () => page.getByRole('dialog', { name: '音を選択', exact: true });
const row = () =>
  page.getByRole('row').filter({ has: page.getByText('Tone notice', { exact: true }) });
const model = () =>
  page.evaluate(() =>
    window.dock.settingsPage.get(
      document.querySelector('.settings-surface').dataset.settingsConnection,
    ),
  );
const events = () => host.app.evaluate(() => globalThis.notificationToneEvents);
const openNotifications = async () => {
  await execute('appdock.settings.open');
  await settingsPage(page);
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await row().waitFor();
};
const expand = async () => {
  for (const block of [page.getByTestId('notification-delivery'), section()])
    if (!(await block.getAttribute('open'))) {
      if (!(await block.evaluate((e) => e.open))) await block.locator(':scope > summary').click();
    }
};
const edit = async () => {
  await row()
    .getByRole('button', { name: /Tone noticeを編集$/ })
    .click();
  return page.getByRole('dialog', { name: 'Tone notice', exact: true });
};
async function start() {
  host = await launch(profile, portable);
  page = host.main;
  page.on('pageerror', (error) => errors.push(String(error)));
  await until(
    async () => (await snapshot()).extensions.find((e) => e.id === id)?.state === 'running',
    'fixture starts',
  );
  await host.app.evaluate(({ app }) => {
    const requireMain = process
      .getBuiltinModule('module')
      .createRequire(app.getAppPath() + '/package.json');
    // Only the OS eligibility answer is a fixture. Use the actual shared Electron audio player.
    requireMain(
      './out/main/main/core/native-notification-state',
    ).NativeNotificationState.prototype.accepts = async () => true;
    const queue = requireMain('./out/main/main/core/audio-service').audioPlayback;
    const original = queue.player;
    globalThis.notificationToneEvents = [];
    queue.player = async (request) => {
      const kind = request.bytes.length === 44 + 1500 * 16 ? 'chime' : 'speech';
      globalThis.notificationToneEvents.push('start:' + kind);
      request.signal.addEventListener(
        'abort',
        () => globalThis.notificationToneEvents.push('abort:' + kind),
        { once: true },
      );
      try {
        await original(request);
      } finally {
        globalThis.notificationToneEvents.push('end:' + kind);
      }
    };
  });
}
(async () => {
  try {
    server = http.createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk;
      requests.push(JSON.parse(text));
      response.setHeader('content-type', 'audio/wav');
      response.end(wave(200));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    Object.assign(settings.host, {
      closeToTray: false,
      hardwareAcceleration: false,
      soundEnabled: true,
    });
    settings.globalShortcutCommands = [];
    settings.keybindings = [];
    settings.gestures.enabled = settings.touchpadGestures.enabled = false;
    settings.updates.checkHostOnStartup =
      settings.updates.checkAppletsOnStartup =
      settings.updates.checkHostOnAboutOpen =
        false;
    settings.tts = {
      ...settings.tts,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'fixture',
      defaultVoice: 'common',
      speedMode: 'server',
    };
    settings.extensions[id] = { enabled: true, settings: {} };
    const directory = path.join(profile, 'data/assets/sounds');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'chime.wav'), wave(1500));
    const folder = path.join(profile, 'extensions', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: 'Tone fixture',
        version: '1.0.0',
        minimumHostVersion: '0.31.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['notifications'],
        commands: ['publish', 'end'].map((key) => ({ id: id + '.' + key, title: key })),
        notificationTypes: [
          {
            typeId: 'message',
            title: 'Tone notice',
            description: 'Local fixture',
            levels: ['info'],
            defaultLevel: 'info',
            allowedTargets: ['banner', 'desktop', 'windows'],
            defaultTargets: [],
            requiredTargets: [],
            lifetimePolicy: 'userDuration',
            defaultDurationSeconds: null,
            history: 'session',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      `exports.activate=async c=>{let notification; c.commands.register('${id}.publish','Publish',async()=>{notification=(await c.notifications.publish({typeId:'message',title:'Tone notice',body:'Local fixture',dedupeKey:'one'})).notificationId;}); c.commands.register('${id}.end','End',async()=>{if(notification)await c.notifications.end(notification);});};`,
    );
    fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
    await start();
    await openNotifications();
    await expand();
    assert.equal((await preferences()).sound, undefined);
    let dialog = await edit();
    assert.equal(
      await dialog.getByLabel('Tone notice: 通知音', { exact: true }).isChecked(),
      false,
    );
    await dialog.getByLabel('Tone notice: 通知音', { exact: true }).check();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal((await preferences()).overrides.find((r) => r.ownerId === id)?.sound, undefined);
    dialog = await edit();
    await dialog.getByLabel('Tone notice: 通知音', { exact: true }).check();
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'hidden' });
    await settleSettings(page);
    assert(await row().getByText('通知音が未選択のため鳴りません。').isVisible());
    await execute(id + '.publish');
    assert.deepEqual(await events(), []);
    checks.push('default no sound/OFF; dialog cancellation and ON without a selection');
    await section().getByRole('button', { name: 'サウンドライブラリーから選択' }).click();
    await picker().getByRole('button', { name: 'chime.wavを選択', exact: true }).click();
    await picker().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    assert.equal((await preferences()).sound, undefined);
    await section().getByRole('button', { name: 'サウンドライブラリーから選択' }).click();
    await picker().getByRole('button', { name: 'chime.wavを選択', exact: true }).click();
    await picker().getByRole('button', { name: '音を使う', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    await until(async () => (await preferences()).sound, 'saved selection');
    const selected = (await preferences()).sound;
    assert(selected.file.startsWith('@library/@assigned/'));
    const assigned = path.join(
      profile,
      'data/assets/assigned-sounds',
      selected.file.split('/').at(-1),
    );
    assert(fs.existsSync(assigned));
    fs.unlinkSync(path.join(directory, 'chime.wav'));
    await section().getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => (await events()).includes('start:chime'), 'preview started');
    await section().getByRole('button', { name: '試聴を停止', exact: true }).click();
    await until(async () => (await events()).includes('abort:chime'), 'preview canceled');
    await until(async () => (await events()).includes('end:chime'), 'actual preview');
    await host.app.evaluate(() => {
      globalThis.notificationToneEvents = [];
    });
    await section().getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => (await events()).includes('start:chime'), 'second preview');
    await page.getByRole('button', { name: '一般', exact: true }).click();
    await until(
      async () => (await events()).includes('abort:chime'),
      'preview canceled on page exit',
    );
    await openNotifications();
    await expand();
    checks.push(
      'library cancel/confirm, retained WAV survives deletion of original, actual shared-player preview',
    );
    await host.app.evaluate(() => {
      globalThis.notificationToneEvents = [];
    });
    await execute(id + '.publish');
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(await events(), []);
    dialog = await edit();
    await dialog.getByLabel('Tone noticeを読み上げる').check();
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'hidden' });
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(async () => (await events()).includes('end:speech'), 'sound then speech');
    assert.deepEqual(await events(), ['start:chime', 'end:chime', 'start:speech', 'end:speech']);
    assert.equal(requests.length, 1);
    checks.push('new ID plays chime then actual TTS player once; existing ID never replays');
    for (const theme of ['light', 'dark']) {
      await host.save({ host: { theme } });
      await host.resize(theme === 'light' ? 1300 : 900, 800);
      await expand();
      await section().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(profile, theme + '.png') });
    }
    await host.save({ host: { soundEnabled: false } });
    await until(
      () => section().getByRole('button', { name: '試聴', exact: true }).isDisabled(),
      'muted preview disabled',
    );
    const before = await events();
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(() => requests.length === 2, 'muted TTS still generates');
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await events(), before);
    await host.save({ host: { soundEnabled: true } });
    dialog = await edit();
    await dialog.getByLabel('Tone noticeの通知センターのみ').check();
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'hidden' });
    let preference = (await preferences()).overrides.find((r) => r.ownerId === id);
    assert.equal(preference.sound, false);
    assert.equal(preference.speak, false);
    checks.push(
      'light/dark and narrow layout; global mute; center-only atomically disables sound and speech',
    );
    dialog = await edit();
    await dialog.getByLabel('Tone notice: 通知音', { exact: true }).check();
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'hidden' });
    await host.close();
    host = undefined;
    await start();
    await openNotifications();
    await expand();
    assert.deepEqual((await preferences()).sound, selected);
    assert.equal((await preferences()).overrides.find((r) => r.ownerId === id).sound, true);
    await execute(id + '.publish');
    await until(async () => (await events()).includes('end:chime'), 'restart sound');
    await section().getByRole('button', { name: '音なしに戻す', exact: true }).click();
    await settleSettings(page);
    assert.equal((await preferences()).sound, undefined);
    assert.equal((await preferences()).overrides.find((r) => r.ownerId === id).sound, true);
    assert(fs.existsSync(assigned));
    checks.push(
      'real process restart retains selection and per-type flag; clearing sound preserves flags and retained asset',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    errors.push(error.stack || String(error));
    if (page && !page.isClosed())
      await page.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host)
      await host.close().catch((error) => {
        success = false;
        errors.push(String(error));
      });
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success,
          checks,
          errors,
          portable,
          audio:
            'Silent WAVs through actual Electron player; OS eligibility and TTS server are fixtures; audible real use unverified.',
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, success, checks, errors }));
    if (!success) process.exitCode = 1;
  }
})();
