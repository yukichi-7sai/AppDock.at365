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
    initial.host.hardwareAcceleration = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    initial.tts = {
      ...initial.tts,
      baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
      model: 'fixture',
      defaultVoice: 'common',
      speedMode: 'server',
    };
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
    fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(initial));
    const exe = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : require('electron');
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
    await page.getByLabel('通知の声に共通設定を使う').uncheck();
    await settleSettings(page);
    const voice = page.getByRole('combobox', { name: '通知用のボイスID', exact: true });
    const toggle = page.getByRole('button', { name: '通知用のボイスIDの候補を表示', exact: true });
    assert.equal(await toggle.isDisabled(), true);
    await voice.fill('custom-voice');
    await voice.press('Enter');
    await settleSettings(page);
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).notificationPreferences
        .speech.voice,
      'custom-voice',
    );
    await page.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
    await until(async () => !(await toggle.isDisabled()), 'voice catalog');
    await toggle.click();
    const list = page.getByRole('listbox', { name: '通知用のボイスIDの候補', exact: true });
    assert.equal(await list.getByRole('option').count(), 2);
    await list.getByRole('option', { name: 'second Second voice', exact: true }).click();
    await settleSettings(page);
    assert.equal(await voice.inputValue(), 'second');
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).notificationPreferences
        .speech.voice,
      'second',
    );
    await voice.fill('not');
    await voice.press('ArrowDown');
    await voice.press('Enter');
    await settleSettings(page);
    assert.equal(await voice.inputValue(), 'notice');
    await toggle.click();
    await voice.press('Escape');
    assert.equal(await voice.getAttribute('aria-expanded'), 'false');
    assert.equal(await voice.inputValue(), 'notice');
    await toggle.click();
    await voice.press('ArrowUp');
    await voice.press('Enter');
    await settleSettings(page);
    assert.equal(await voice.inputValue(), 'second');
    await voice.fill('notice');
    await voice.press('Tab');
    assert.equal(await voice.getAttribute('aria-expanded'), 'false');
    for (const theme of ['light', 'dark']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        () => page.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme',
      );
      for (const width of [1280, 760]) {
        await inspect(
          mainPort,
          electronExpression +
            `.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/')).setSize(${width}, 850)`,
        );
        await toggle.click();
        await list.waitFor();
        const bounds = await page.evaluate(() => {
          const input = document.querySelector('[aria-label="通知用のボイスID"]');
          const list = document.querySelector(
            '[role="listbox"][aria-label="通知用のボイスIDの候補"]',
          );
          const i = input.getBoundingClientRect(),
            l = list.getBoundingClientRect();
          return {
            aligned: Math.abs(i.left - l.left) < 2 && Math.abs(i.width - l.width) < 2,
            separate: l.top >= i.bottom || l.bottom <= i.top,
            inside: l.left >= 0 && l.top >= 0 && l.right <= innerWidth && l.bottom <= innerHeight,
            overlap: [
              ...document.querySelectorAll('.notification-settings .settings-actions'),
            ].some((actions) => {
              const a = actions.getBoundingClientRect();
              return a.height && a.top < i.bottom && a.bottom > i.top;
            }),
          };
        });
        assert.deepEqual(bounds, { aligned: true, separate: true, inside: true, overlap: false });
        await page.screenshot({ path: path.join(profile, `voices-${theme}-${width}.png`) });
        await voice.press('Escape');
      }
    }
    checks.push(
      'editable voice suggestions: manual/click/keyboard saves, Escape/Tab, light/dark 1280/760 aligned popup and no action-row overlap',
    );
    await settleSettings(page);
    await page.getByLabel('通知の速度に共通設定を使う').uncheck();
    await settleSettings(page);
    await page.getByLabel('通知用の読み上げ速度').fill('1.6');
    await page.getByLabel('通知用の読み上げ速度').press('Enter');
    await settleSettings(page);
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
    const saved = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json')));
    assert.deepEqual(saved.notificationPreferences.speech, { voice: 'notice', speed: 1.6 });
    assert.equal(saved.notificationPreferences.overrides.find((r) => r.ownerId === id).speak, true);
    checks.push(
      'voice/speed save immediately; notification speech saves only after dialog confirmation',
    );
    await execute(id + '.update');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(requests.length, 0);
    checks.push('ON does not replay existing episode');
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(() => requests.length === 1, 'notification TTS');
    assert.equal(requests[0].voice, 'notice');
    assert.equal(requests[0].speed, 1.6);
    assert.equal(requests[0].model, 'fixture');
    assert.equal(requests[0].input, 'Fixture notice。Notification body');
    await until(async () => {
      const logs = (await snapshot()).logs;
      return logs.some((l) => JSON.stringify(l).includes('state=completed'));
    }, 'playback completed');
    checks.push('automatic center-only speech with common endpoint and notification voice/speed');
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
      delete speech.voice;
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          notificationPreferences: { ...s.settings.value.notificationPreferences, speech },
        },
        s.settings.revision,
      );
    });
    await until(
      () => page.getByLabel('通知の声に共通設定を使う').isChecked(),
      'external voice inheritance',
    );
    checks.push('external saved voice reset updates inheritance without stale local override');
    await settleSettings(page);
    await page.getByLabel('通知の速度に共通設定を使う').check();
    await settleSettings(page);
    await execute(id + '.end');
    await execute(id + '.publish');
    await until(() => requests.length === 3, 'inherited speech');
    assert.equal(requests[2].voice, 'common');
    assert.equal(requests[2].speed, 1);
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
              ...s.settings.value.tts,
              baseUrl: 'http://alice:8080/v1',
              model: '1.7B-Base',
              defaultVoice: 'yui',
              speedMode: 'playback',
            },
            notificationPreferences: {
              ...s.settings.value.notificationPreferences,
              speech: { voice: 'yui', speed: 1.4 },
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
    await page.getByLabel('通知の声に共通設定を使う').uncheck();
    await settleSettings(page);
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, tts: { ...s.settings.value.tts, model: 'fixture-updated' } },
        s.settings.revision,
      );
    });
    await until(() => toggle.isDisabled(), 'TTS change invalidates cached voices');
    await page.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
    await until(async () => !(await toggle.isDisabled()), 'voices reload after TTS change');
    checks.push(
      'TTS configuration change invalidates the voice catalog; unrelated voice/speed/theme saves retain it',
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
