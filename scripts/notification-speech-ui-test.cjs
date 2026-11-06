const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'notification-speech-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  requests = [];
let child,
  browser,
  host,
  server,
  success = false;
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const savedNotifications = () =>
  require('./test-settings.cjs').read(profile).notificationPreferences;
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(label);
};
function wave() {
  const b = Buffer.alloc(4844);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      if (req.url === '/v1/audio/voices') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            voices: [
              { id: 'notice', name: 'Notice' },
              { id: 'second', name: 'Second voice' },
            ],
          }),
        );
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push(JSON.parse(raw));
      res.setHeader('Content-Type', 'audio/wav');
      res.end(wave());
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.updates.checkHostOnAboutOpen = false;
    initial.updates.checkHostOnStartup = false;
    initial.updates.checkAppletsOnStartup = false;
    initial.host.hardwareAcceleration = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    initial.tts = {
      connections: [
        {
          id: 'default',
          name: 'Fixture',
          ...initial.tts.connections[0],
          baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
          model: 'fixture',
          defaultVoice: 'common',
        },
      ],
      defaultConnectionId: 'default',
    };
    initial.tts.connections.push({
      ...initial.tts.connections[0],
      id: 'notification',
      name: '通知用',
      model: 'notification-model',
      defaultVoice: 'notice',
      instructionsMode: 'json',
      alwaysInstructions: '常時の話し方',
      defaultInstructions: '既定の話し方',
    });
    const id = 'fixture.speech';
    const folder = path.join(profile, 'extensions', id);
    fs.mkdirSync(folder, { recursive: true });
    const commands = ['publish', 'update', 'end', 'real', 'sound'].map((k) => ({
      id: id + '.' + k,
      title: k,
    }));
    const type = {
      typeId: 'message',
      title: 'Speech notice',
      description: 'Fixture',
      levels: ['info'],
      defaultLevel: 'info',
      defaultEnabled: true,
      canDisable: true,
      disabledControlReason: '',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: [],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: null,
      history: 'none',
    };
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: 'Speech fixture',
        version: '1.0.0',
        minimumHostVersion: '0.31.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['notifications', 'audio'],
        commands,
        notificationTypes: [type],
      }),
    );
    const soundFile = path.join(profile, 'notice.wav');
    fs.writeFileSync(soundFile, wave());
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      "exports.activate=async c=>{let id;const pub=async()=>{id=(await c.notifications.publish({typeId:'message',title:'Fixture notice',body:'Notification body',dedupeKey:'episode'})).notificationId;};c.commands.register('fixture.speech.publish','Publish',pub);c.commands.register('fixture.speech.update','Update',pub);c.commands.register('fixture.speech.end','End',async()=>{if(id)await c.notifications.end(id);});c.commands.register('fixture.speech.sound','Sound',async()=>{await c.audio.play(" +
        JSON.stringify(soundFile) +
        ");});c.commands.register('fixture.speech.real','Real',async()=>{id=(await c.notifications.publish({typeId:'message',title:'通知読み上げの動作確認です。',body:'',dedupeKey:'real'})).notificationId;});};",
    );
    initial.extensions[id] = { enabled: true, settings: {} };
    require('./test-settings.cjs').write(profile, initial);
    const exe = process.argv[2] ? testHostPath(profile) : require('electron');
    if (process.argv[2]) {
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), exe);
      assert.equal(hash(exe), hash(path.resolve(process.argv[2])));
    }
    const port = await freePort(),
      mainPort = await freePort(),
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [
        ...(process.argv[2] ? [] : [root]),
        '--test-profile=' + profile,
        '--remote-debugging-port=' + port,
        '--inspect=' + mainPort,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
      'CDP',
    );
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    host.setDefaultTimeout(15000);
    await until(async () => {
      const s = await snapshot();
      return s.startupReady && s.extensions.find((e) => e.id === id)?.state === 'running';
    }, 'startup');
    const execute = (cmd) => host.evaluate((cmd) => window.dock.executeCommand(cmd), cmd);
    await execute('appdock.settings.open');
    let page = await settingsPage(host);
    await page.getByRole('button', { name: '通知', exact: true }).click();
    const noticeRow = page
      .getByRole('row')
      .filter({ has: page.getByText('Speech notice', { exact: true }) });
    await noticeRow.waitFor();
    await execute(id + '.publish');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(requests.length, 0);
    checks.push('default OFF');
    await page.getByTestId('notification-delivery').locator(':scope > summary').click();
    await page.getByTestId('notification-speech').locator(':scope > summary').click();
    const connection = page.getByLabel('使用する音声サーバー', { exact: true });
    const instructions = page.getByLabel('通知用の話し方', { exact: true });
    await connection.selectOption('notification');
    await settleSettings(page);
    await instructions.fill('通知の話し方');
    await instructions.press('Enter');
    await settleSettings(page);
    await instructions.fill('取り消す話し方');
    await instructions.press('Escape');
    assert.equal(await instructions.inputValue(), '通知の話し方');
    assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, 'default');
    for (const [theme, width, height] of [
      ['light', 1720, 1000],
      ['dark', 900, 620],
    ]) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await inspect(
        mainPort,
        electronExpression +
          '.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith("appdock://host/")).setSize(' +
          width +
          ',' +
          height +
          ')',
      );
      await until(
        () => page.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme',
      );
      await instructions.scrollIntoViewIfNeeded();
      assert.equal(await connection.inputValue(), 'notification');
      assert.equal(await instructions.inputValue(), '通知の話し方');
      await page.screenshot({ path: path.join(profile, 'speech-' + theme + '.png') });
    }
    checks.push(
      'server selection and notification instructions save independently, Escape cancels, light/wide and dark/narrow retain controls',
    );
    const beforeNotificationEdit = (await snapshot()).settings.value.notificationPreferences;
    await noticeRow.getByRole('button', { name: /Speech noticeを編集$/ }).click();
    const notificationDialog = page.getByRole('dialog');
    await notificationDialog.getByLabel('Speech noticeを読み上げる').check();
    assert.deepEqual(
      (await snapshot()).settings.value.notificationPreferences,
      beforeNotificationEdit,
    );
    await notificationDialog.getByTestId('settings-dialog-confirm').click();
    await notificationDialog.waitFor({ state: 'hidden' });
    await settleSettings(page);
    const saved = savedNotifications();
    assert.deepEqual(saved.speech, { connectionId: 'notification', instructions: '通知の話し方' });
    assert.equal(saved.overrides.find((r) => r.ownerId === id).speak, true);
    checks.push(
      'server/instructions save immediately; notification type speech saves only after dialog confirmation',
    );
    await execute(id + '.update');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(requests.length, 0);
    checks.push('ON does not replay existing episode');
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(() => requests.length === 1, 'notification TTS');
    assert.equal(requests[0].voice, 'notice');
    assert.equal(Object.hasOwn(requests[0], 'speed'), false);
    assert.equal(requests[0].model, 'notification-model');
    assert.equal(requests[0].instructions, '常時の話し方\n通知の話し方');
    assert.equal(requests[0].input, 'Fixture notice。Notification body');
    await until(async () => {
      const logs = (await snapshot()).logs;
      return logs.some((l) => JSON.stringify(l).includes('state=completed'));
    }, 'playback completed');
    checks.push(
      'automatic center-only speech uses the selected server voice and notification instructions',
    );
    await execute(id + '.update');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(requests.length, 1);
    checks.push('update does not repeat');
    await page.getByRole('button', { name: '通知の読み上げを試聴', exact: true }).click();
    await until(() => requests.length === 2, 'preview request');
    await until(async () => {
      const m = await page.evaluate(() =>
        window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        ),
      );
      return m.content.auxiliary.notificationSpeech.jobs.at(-1)?.state === 'completed';
    }, 'preview ended');
    checks.push('notification preview completed');
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      const speech = { ...s.settings.value.notificationPreferences.speech };
      delete speech.connectionId;
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          notificationPreferences: { ...s.settings.value.notificationPreferences, speech },
        },
        s.settings.revision,
      );
    });
    await until(async () => (await connection.inputValue()) === '', 'external server inheritance');
    checks.push(
      'external server reset updates the selection and retains notification instructions',
    );
    await settleSettings(page);
    assert.equal(await instructions.inputValue(), '通知の話し方');
    await instructions.fill('');
    await instructions.press('Enter');
    await settleSettings(page);
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(() => requests.length === 3, 'inherited speech');
    assert.equal(requests[2].voice, 'common');
    assert.equal(Object.hasOwn(requests[2], 'speed'), false);
    checks.push('independent inheritance restoration');
    const requireMain = `process.getBuiltinModule('module').createRequire(${electronExpression}.app.getAppPath()+'/package.json')`;
    await until(
      () =>
        inspect(
          mainPort,
          `!${requireMain}('./out/main/main/core/audio-service').audioPlayback.active`,
        ),
      'audio idle',
    );
    await inspect(
      mainPort,
      `(()=>{const q=${requireMain}('./out/main/main/core/audio-service').audioPlayback;const original=q.player;globalThis.lockAudioStarts=0;q.player=async r=>{globalThis.lockAudioStarts++;await original(r);};return true;})()`,
    );
    await inspect(mainPort, electronExpression + ".powerMonitor.emit('lock-screen')");
    await execute(id + '.end');
    await execute(id + '.publish');
    await execute(id + '.sound');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(requests.length, 3);
    assert.equal(await inspect(mainPort, 'globalThis.lockAudioStarts'), 0);
    await inspect(mainPort, electronExpression + ".powerMonitor.emit('unlock-screen')");
    await until(() => requests.length === 4, 'deferred speech after unlock');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(requests.length, 4);
    checks.push('lock defers speech without desktop and unlock delivers once');
    await until(
      () => inspect(mainPort, 'globalThis.lockAudioStarts===2'),
      'deferred sound and speech playback',
    );
    await until(
      () =>
        inspect(
          mainPort,
          `!${requireMain}('./out/main/main/core/audio-service').audioPlayback.active`,
        ),
      'deferred audio finished',
    );
    checks.push(
      'Applet notification sound waits while locked and shares real audio FIFO with deferred speech',
    );
    if (process.env.APPDOCK_TTS_REAL === '1') {
      await host.evaluate(async () => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          {
            ...s.settings.value,
            tts: {
              connections: [
                {
                  id: 'default',
                  name: 'Fixture',
                  ...s.settings.value.tts.connections[0],
                  baseUrl: 'http://alice:8080/v1',
                  model: '1.7B-Base',
                  defaultVoice: 'yui',
                },
              ],
              defaultConnectionId: 'default',
            },
            notificationPreferences: {
              ...s.settings.value.notificationPreferences,
              speech: {},
            },
          },
          s.settings.revision,
        );
      });
      const before = (await snapshot()).logs.filter((l) =>
        JSON.stringify(l).includes('[TTS]'),
      ).length;
      await execute(id + '.end');
      const start = Date.now();
      await execute(id + '.real');
      await until(
        async () =>
          (await snapshot()).logs
            .filter((l) => JSON.stringify(l).includes('[TTS]'))
            .slice(before)
            .some((l) => JSON.stringify(l).includes('state=completed')),
        'real notification playback',
      );
      checks.push(
        'real server Japanese notification completed at 1.4 in ' + (Date.now() - start) + 'ms',
      );
    }
    await connection.selectOption('notification');
    await settleSettings(page);
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          tts: {
            ...s.settings.value.tts,
            connections: s.settings.value.tts.connections.filter((c) => c.id !== 'notification'),
          },
        },
        s.settings.revision,
      );
    });
    await until(
      () => page.getByRole('button', { name: '通知の読み上げを試聴', exact: true }).isDisabled(),
      'deleted server cannot preview',
    );
    assert.equal(await connection.inputValue(), 'notification');
    await connection.selectOption('');
    await settleSettings(page);
    assert.equal(
      await page.getByRole('button', { name: '通知の読み上げを試聴', exact: true }).isEnabled(),
      true,
    );
    checks.push(
      'deleted explicit server stays visible without falling back; choosing the default recovers preview',
    );
    await page.screenshot({ path: path.join(profile, 'settings.png') });
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    success = true;
  } catch (e) {
    fs.writeFileSync(path.join(profile, 'error.txt'), e.stack || String(e));
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child)
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch (e) {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    const result = {
      success,
      profile,
      checks,
      version: require('../package.json').version,
      portable: process.argv[2] ? { sha256: hash(process.argv[2]) } : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
