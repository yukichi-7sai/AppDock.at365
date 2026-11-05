const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright'),
  { parse } = require('smol-toml');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js'),
  { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', `tts-ui-${Date.now()}`),
  local = path.join(profile, 'local');
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  requests = [];
let child, browser, host, client, server;
function wave(seconds = 0.3) {
  const data = Math.ceil(seconds * 8000) * 2,
    b = Buffer.alloc(44 + data);
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
  b.writeUInt32LE(data, 40);
  return b;
}
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(label);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r.structuredContent));
  return r.structuredContent;
}
async function state(job) {
  return call('appdock_tts_get_job', { jobId: job.jobId });
}
async function configure(patch) {
  await host.evaluate(async (patch) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...s.settings.value, tts: { ...s.settings.value.tts, ...patch } },
      s.settings.revision,
    );
  }, patch);
}
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      if (req.url === '/v1/audio/voices') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ voices: [{ id: 'voice-a', name: 'Voice A' }] }));
        return;
      }
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      requests.push({ body, auth: req.headers.authorization });
      res.setHeader('Content-Type', 'audio/wav');
      res.end(wave(body.input.includes('long') ? 31 : 0.3));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.host.hardwareAcceleration = false;
    settings.host.notifications = false;
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.tts = {
      ...settings.tts,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'test',
      defaultVoice: 'voice-a',
    };
    const fixtureBuild = spawnSync(
      'dotnet',
      [
        'build',
        path.join(
          root,
          'tests/fixtures/dotnet/AppDock.Extensions.TtsProbe/AppDock.Extensions.TtsProbe.csproj',
        ),
        '-c',
        'Release',
      ],
      { cwd: root, stdio: 'inherit', windowsHide: true },
    );
    if (fixtureBuild.error) throw fixtureBuild.error;
    assert.equal(fixtureBuild.status, 0, 'current .NET speech fixture build');
    for (const [id, dotnet] of [
      ['fixture.tts-node', false],
      ['fixture.tts-dotnet', true],
    ]) {
      const dir = path.join(profile, 'extensions', id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'extension.json'),
        JSON.stringify({
          apiVersion: 1,
          id,
          name: id,
          version: '1.0.0',
          minimumHostVersion: '0.154.0',
          runtime: dotnet ? 'dotnet' : 'node',
          entry: dotnet ? 'AppDock.Extensions.TtsProbe.dll' : 'index.cjs',
          ...(dotnet ? { type: 'AppDock.Extensions.TtsProbe.TtsProbe' } : {}),
          capabilities: ['appdock-api'],
          commands: [{ id: id + '.speak', title: 'TTS probe', automation: true }],
        }),
      );
      settings.extensions[id] = { enabled: true, settings: {} };
      if (dotnet)
        require('./copy-host.cjs').copyHost(
          path.join(
            root,
            'tests/fixtures/dotnet/AppDock.Extensions.TtsProbe/bin/Release/net10.0/AppDock.Extensions.TtsProbe.dll',
          ),
          path.join(dir, 'AppDock.Extensions.TtsProbe.dll'),
        );
      else
        fs.writeFileSync(
          path.join(dir, 'index.cjs'),
          `exports.activate=async c=>c.commands.register('fixture.tts-node.speak','TTS probe',async()=>{let r;try{await c.appdock.call('tts.voices.list');const j=await c.appdock.call('tts.speak',{text:'SDK音声テスト。',speed:1.4,instructions:'Nodeのニュアンス',requestId:require('node:crypto').randomUUID()});r={ok:true,...await c.appdock.call('tts.jobs.get',{jobId:j.jobId})};}catch(e){r={code:e.code};}await c.log.info('tts-probe:'+JSON.stringify(r));});`,
        );
    }
    fs.writeFileSync(
      require('./test-settings.cjs').file(profile, 'settings.json'),
      JSON.stringify(settings),
    );
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const inspector = await freePort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let executable = require('electron'),
      args = [root];
    if (process.argv[2]) {
      executable = testHostPath(profile);
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
      assert.equal(
        createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
        createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'),
      );
      args = [];
    }
    const launch = async () => {
      child = spawn(
        executable,
        [
          ...args,
          `--test-profile=${profile}`,
          `--test-local-state=${local}`,
          `--remote-debugging-port=${port}`,
          `--inspect=127.0.0.1:${inspector}`,
        ],
        { env, cwd: profile, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      child.stderr.on('data', (b) => fs.appendFileSync(path.join(profile, 'electron.log'), b));
      browser = await until(
        () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
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
      host.on('pageerror', (error) =>
        fs.appendFileSync(
          path.join(profile, 'renderer-errors.log'),
          String(error.stack || error) + '\n',
        ),
      );
      await until(async () => {
        const s = await snapshot();
        return (
          s.startupReady &&
          s.extensions
            .filter((e) => e.id.startsWith('fixture.tts-'))
            .every((e) => e.state === 'running')
        );
      }, 'startup');
      await host.evaluate(() => window.dock.executeCommand('appdock.open'));
    };
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    let page = await settingsPage(host);
    await until(
      () => page.evaluate(() => innerHeight > 200 && innerWidth > 300),
      'settings viewport',
    );
    await page.screenshot({ path: path.join(profile, 'before.png') });
    fs.writeFileSync(
      path.join(profile, 'layout.json'),
      JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          buttons: [...document.querySelectorAll('button')]
            .filter((b) => b.textContent.trim() === '音声生成AI')
            .map((b) => ({ rect: b.getBoundingClientRect().toJSON(), html: b.outerHTML })),
        })),
        null,
        2,
      ),
    );
    await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
    await page.getByLabel('TTSモデル', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
    await page
      .getByText('1件のボイスを取得しました。候補から選ぶか、IDを直接入力できます。', {
        exact: true,
      })
      .waitFor();
    checks.push('settings voice list');
    await page.getByLabel('APIキー', { exact: true }).fill('fixture-secret');
    await page.getByRole('button', { name: 'APIキーを設定', exact: true }).click();
    const keyfile = path.join(local, 'tts-key.json');
    await until(() => fs.existsSync(keyfile), 'key saved');
    await page
      .getByRole('button', { name: 'APIキーを削除', exact: true })
      .waitFor({ state: 'visible' });
    assert(!fs.readFileSync(keyfile, 'utf8').includes('fixture-secret'));
    assert(
      !JSON.stringify(
        await page.evaluate(() =>
          window.dock.settingsPage.get(
            document.querySelector('.settings-surface').dataset.settingsConnection,
          ),
        ),
      ).includes('fixture-secret'),
    );
    checks.push('encrypted key and public model privacy');
    const savedKey = fs.readFileSync(keyfile);
    const selectPreset = async (value) => {
      await page.getByLabel('接続プリセット', { exact: true }).selectOption(value);
      await settleSettings(page);
      await until(
        async () => (await snapshot()).settings.value.tts.preset === value,
        'preset saved',
      );
    };
    await selectPreset('openai-speech');
    assert.equal((await snapshot()).settings.value.tts.voicesSource, 'manual');
    assert.equal((await snapshot()).settings.value.tts.baseUrl, settings.tts.baseUrl);
    assert.deepEqual(fs.readFileSync(keyfile), savedKey);
    await page.getByLabel('既定のボイス', { exact: true }).fill('');
    await page.getByLabel('既定のボイス', { exact: true }).press('Enter');
    await settleSettings(page);
    await selectPreset('ollama');
    assert.equal((await snapshot()).settings.value.tts.instructionsMode, 'none');
    assert.equal((await snapshot()).settings.value.tts.defaultVoice, 'default');
    assert.deepEqual((await snapshot()).settings.value.tts.manualVoices, [
      { id: 'default', name: 'default' },
    ]);
    assert.equal(await page.getByLabel('既定のボイス', { exact: true }).inputValue(), 'default');
    assert.equal(await page.getByLabel('取得したボイス', { exact: true }).inputValue(), 'default');
    const presetDetails = page.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' });
    await presetDetails.press('Enter');
    const manualVoices = page.getByLabel('手動ボイス一覧', { exact: true });
    for (const empty of ['', ' \n\t ']) {
      await manualVoices.fill(empty);
      await manualVoices.press(empty ? 'Tab' : 'Enter');
      await settleSettings(page);
      assert.deepEqual((await snapshot()).settings.value.tts.manualVoices, []);
      assert.equal(await manualVoices.inputValue(), '[]');
      assert.equal((await snapshot()).settings.value.tts.defaultVoice, 'default');
      await page.getByRole('button', { name: 'プリセットの詳細設定に戻す', exact: true }).click();
      await settleSettings(page);
      assert.equal((await snapshot()).settings.value.tts.manualVoices[0].id, 'default');
    }
    await manualVoices.fill('[{"id":"default","name":"標準ボイス"}]');
    await manualVoices.press('Enter');
    await settleSettings(page);
    assert.equal(
      await page
        .getByLabel('取得したボイス', { exact: true })
        .locator('option:checked')
        .textContent(),
      '標準ボイス',
    );
    await manualVoices.fill('[{"id":"other","name":"取り消す声"}]');
    await manualVoices.press('Escape');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.manualVoices[0].name, '標準ボイス');
    const savedManualVoices = (await snapshot()).settings.value.tts.manualVoices;
    for (const invalid of ['{}', '[{"id":"default","name":{}}]']) {
      await manualVoices.fill(invalid);
      await manualVoices.press('Enter');
      try {
        await settleSettings(page);
        assert.deepEqual((await snapshot()).settings.value.tts.manualVoices, savedManualVoices);
        await page
          .locator('.settings-error-summary')
          .filter({ hasText: '手動ボイス一覧をJSON配列で入力してください。' })
          .waitFor({ timeout: 5000 });
        assert.equal(await manualVoices.inputValue(), invalid);
        assert.equal(
          await page.getByLabel('取得したボイス', { exact: true }).inputValue(),
          'default',
        );
        if (invalid === '{}')
          await page.screenshot({ path: path.join(profile, 'manual-voices-validation.png') });
      } catch (error) {
        await page.screenshot({ path: path.join(profile, 'invalid-manual-voices.png') });
        throw error;
      }
      await manualVoices.fill(JSON.stringify(savedManualVoices));
      await manualVoices.press('Enter');
      await settleSettings(page);
      await page
        .locator('.settings-error-summary')
        .filter({ hasText: '手動ボイス一覧をJSON配列で入力してください。' })
        .waitFor({ state: 'hidden' });
    }
    assert.equal(fs.existsSync(path.join(profile, 'renderer-errors.log')), false);
    checks.push(
      'invalid manual voice JSON keeps the page and saved candidates intact and allows correction',
    );
    await page.getByLabel('既定のボイス', { exact: true }).fill('voice-a');
    await page.getByLabel('既定のボイス', { exact: true }).press('Enter');
    await settleSettings(page);
    await selectPreset('custom');
    await selectPreset('ollama');
    assert.equal((await snapshot()).settings.value.tts.defaultVoice, 'voice-a');
    assert.equal((await snapshot()).settings.value.tts.manualVoices[0].name, '標準ボイス');
    await presetDetails.press('Enter');
    checks.push(
      'Ollama fills empty voices and manual JSON updates candidates without fetching or losing saved values',
    );
    await selectPreset('qwen3-tts');
    assert.equal((await snapshot()).settings.value.tts.instructionsMode, 'json');
    await selectPreset('mlx-audio');
    const mlx = (await snapshot()).settings.value.tts;
    assert.equal(mlx.instructionsMode, 'json');
    assert.equal(mlx.instructionsParameter, 'instruct');
    assert.equal(mlx.voicesSource, 'manual');
    assert.equal(mlx.defaultVoice, 'voice-a');
    assert.equal(mlx.manualVoices[0].name, '標準ボイス');
    await page.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' }).click();
    await page.getByLabel('ニュアンスの送信先', { exact: true }).fill('generation.instruct');
    await page.getByLabel('ニュアンスの送信先', { exact: true }).press('Enter');
    await settleSettings(page);
    await page.getByText('カスタマイズ済み', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'プリセットの詳細設定に戻す', exact: true }).click();
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.instructionsParameter, 'instruct');
    await page.getByLabel('ニュアンスの送信先', { exact: true }).fill('generation.instruct');
    await page.getByLabel('ニュアンスの送信先', { exact: true }).press('Enter');
    await settleSettings(page);
    const alwaysInstructions = '自然な日本語で\n聞き取りやすく';
    const alwaysControl = page.getByLabel('常に付与するニュアンス', { exact: true });
    await alwaysControl.fill('取り消す常時付与');
    await alwaysControl.press('Escape');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.alwaysInstructions, '');
    await alwaysControl.fill(alwaysInstructions);
    await alwaysControl.press('Tab');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.alwaysInstructions, alwaysInstructions);
    await page.getByLabel('既定のニュアンス', { exact: true }).fill('やさしく、落ち着いて');
    await page.getByLabel('既定のニュアンス', { exact: true }).press('Escape');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.defaultInstructions, '');
    await page.getByLabel('既定のニュアンス', { exact: true }).fill('やさしく、落ち着いて');
    await page.getByLabel('既定のニュアンス', { exact: true }).press('Enter');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.defaultInstructions, 'やさしく、落ち着いて');
    const extraControl = page.getByLabel('追加パラメーター（JSON）', { exact: true });
    await extraControl.fill('{"language":');
    await extraControl.press('Enter');
    await settleSettings(page);
    assert.deepEqual((await snapshot()).settings.value.tts.extraBody, {});
    const extraBody = { language: 'Japanese', generation: { temperature: 0.4 } };
    await extraControl.fill(JSON.stringify(extraBody));
    await extraControl.press('Enter');
    await settleSettings(page);
    assert.deepEqual((await snapshot()).settings.value.tts.extraBody, extraBody);
    await extraControl.fill('{"language":"English"}');
    await extraControl.press('Escape');
    await settleSettings(page);
    assert.deepEqual((await snapshot()).settings.value.tts.extraBody, extraBody);
    checks.push('custom JSON rejects invalid input, saves typed values and cancels edits');
    checks.push(
      'preset selection, credential preservation, custom mapping, reset and default nuance save/cancel',
    );
    const layouts = [];
    for (const [theme, width, height] of [
      ['light', 1720, 1000],
      ['dark', 900, 620],
    ]) {
      const bounds = await inspect(
        inspector,
        `(() => {
        const { BrowserWindow } = ${electronExpression};
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/index.html'));
        window.setSize(${width}, ${height});
        return { bounds: window.getBounds(), zoom: window.webContents.getZoomFactor() };
      })()`,
      );
      await page.getByRole('button', { name: '表示', exact: true }).click();
      await page.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(page);
      await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
      await page.getByLabel('接続プリセット', { exact: true }).waitFor({ state: 'visible' });
      const details = page.locator('details').filter({ hasText: 'サーバーに合わせた詳細設定' });
      assert.equal(
        await page.getByRole('button', { name: '設定を再読み込み', exact: true }).count(),
        0,
      );
      for (const [label, file] of [
        ['接続プリセット', 'connection'],
        ['ニュアンスの送信先', 'connection-details'],
        ['追加パラメーター（JSON）', 'additional-parameters'],
        ['手動ボイス一覧', 'manual-voices'],
        ['常に付与するニュアンス', 'always-instructions'],
        ['既定のニュアンス', 'default-instructions'],
      ]) {
        const control = page.getByLabel(label, { exact: true });
        if (label === 'ニュアンスの送信先' && !(await details.evaluate((e) => e.open)))
          await details.locator('summary').press('Enter');
        if (label === 'ニュアンスの送信先')
          assert.equal(await details.evaluate((e) => e.open), true, 'advanced section expanded');
        await control.scrollIntoViewIfNeeded();
        try {
          await control.click();
        } catch (error) {
          fs.writeFileSync(
            path.join(profile, 'layout-failure.json'),
            JSON.stringify(
              {
                theme,
                label,
                details: await details.evaluate((e) => ({ open: e.open, html: e.outerHTML })),
                control: await control.evaluate((e) => ({
                  rect: e.getBoundingClientRect().toJSON(),
                  visible: e.checkVisibility(),
                  ancestors: Array.from(
                    (function* () {
                      let p = e;
                      while (p) {
                        yield p;
                        p = p.parentElement;
                      }
                    })(),
                  ).map((p) => ({
                    tag: p.tagName,
                    cls: p.className,
                    open: p.open,
                    display: getComputedStyle(p).display,
                    visibility: getComputedStyle(p).visibility,
                  })),
                })),
              },
              null,
              2,
            ),
          );
          throw error;
        }
        if (label === '接続プリセット') await control.press('Escape');
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const png = await inspect(
          inspector,
          `(async () => {
          const { BrowserWindow } = ${electronExpression};
          const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/index.html'));
          return (await window.webContents.capturePage()).toPNG().toString('base64');
        })()`,
        );
        fs.writeFileSync(path.join(profile, `${theme}-${file}.png`), Buffer.from(png, 'base64'));
        layouts.push({
          theme,
          label,
          ...bounds,
          ...(await control.evaluate((element) => {
            const r = element.getBoundingClientRect();
            return {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
              rect: r.toJSON(),
            };
          })),
        });
      }
    }
    fs.writeFileSync(path.join(profile, 'tts-layouts.json'), JSON.stringify(layouts, null, 2));
    checks.push('light 1720x1000 and dark 900x620 connection, details and default nuance');
    await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
    await until(() => child.exitCode !== null, 'restart exit');
    await browser.close();
    await launch();
    assert.equal((await snapshot()).settings.value.tts.preset, 'mlx-audio');
    assert.equal(
      (await snapshot()).settings.value.tts.instructionsParameter,
      'generation.instruct',
    );
    assert.equal((await snapshot()).settings.value.tts.defaultInstructions, 'やさしく、落ち着いて');
    assert.deepEqual(fs.readFileSync(keyfile), savedKey);
    assert.equal((await snapshot()).settings.value.tts.alwaysInstructions, alwaysInstructions);
    assert.deepEqual((await snapshot()).settings.value.tts.extraBody, extraBody);
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
    assert.equal(
      await page.getByLabel('常に付与するニュアンス', { exact: true }).inputValue(),
      alwaysInstructions,
    );
    assert.equal(
      await page.getByLabel('既定のニュアンス', { exact: true }).inputValue(),
      'やさしく、落ち着いて',
    );
    checks.push('preset, custom mapping, default nuance and credential survive process restart');
    await page.getByLabel('読み上げ速度', { exact: true }).fill('1.4');
    await page.getByLabel('読み上げ速度', { exact: true }).press('Enter');
    await settleSettings(page);
    await page.getByLabel('試聴するテキスト', { exact: true }).fill('設定画面の音声テスト。');
    await page.getByRole('button', { name: '試聴する', exact: true }).click();
    await until(async () => {
      const m = await page.evaluate(() =>
        window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        ),
      );
      return m.content.auxiliary.tts.jobs.at(-1)?.state === 'completed';
    }, 'preview ended');
    assert.equal(requests.at(-1).auth, 'Bearer fixture-secret');
    assert.equal(requests.at(-1).body.speed, 1);
    assert.equal(
      requests.at(-1).body.generation.instruct,
      alwaysInstructions + '\nやさしく、落ち着いて',
    );
    assert.equal(requests.at(-1).body.language, 'Japanese');
    assert.equal(requests.at(-1).body.generation.temperature, 0.4);
    checks.push('settings preview ends and playback speed avoids double speed');
    await page.getByRole('button', { name: 'APIキーを削除', exact: true }).click();
    await until(() => !fs.existsSync(keyfile), 'key deleted');
    assert(!fs.existsSync(keyfile));
    await host.evaluate(() =>
      window.dock.setAppletApiPermissions({ read: true, execute: true, useTts: true }),
    );
    for (const id of ['fixture.tts-node', 'fixture.tts-dotnet']) {
      await host.evaluate((id) => window.dock.executeCommand(id + '.speak'), id);
      const job = await until(async () => {
        const s = await snapshot();
        const log = s.logs.find((l) => l.source === id && l.message.startsWith('tts-probe:'));
        return log && JSON.parse(log.message.slice(10));
      }, id);
      assert.equal(job.ok, true);
      await until(
        async () =>
          (await snapshot()).logs.some((l) =>
            l.message.includes('jobId=' + job.jobId + ' state=completed'),
          ),
        id + ' completion',
      );
      checks.push(id + ' SDK accepted and completed');
      assert.equal(
        requests.at(-1).body.generation.instruct,
        alwaysInstructions +
          '\n' +
          (id.endsWith('dotnet') ? '.NETのニュアンス' : 'Nodeのニュアンス'),
      );
      assert.equal(requests.at(-1).body.language, 'Japanese');
    }
    const configFile = path.join(profile, 'config.toml');
    fs.writeFileSync(configFile, '');
    await host.evaluate(async (configFile) => {
      await window.dock.automation({ kind: 'selectConfig', file: configFile });
      await window.dock.automation({
        kind: 'configure',
        enabled: true,
        allowWrite: false,
        port: 0,
      });
      await window.dock.automation({ kind: 'setExecution', allowed: true });
      await window.dock.automation({ kind: 'setTts', allowed: true });
      await window.dock.automation({ kind: 'register' });
    }, configFile);
    const mcp = (await host.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
    const headers = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[mcp.serverId]
      .http_headers;
    client = new Client({ name: 'TTS integration', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcp.endpoint), { requestInit: { headers } }),
    );
    const tools = (await client.listTools()).tools;
    assert(tools.some((t) => t.name === 'appdock_tts_speak'));
    assert.equal(
      tools.find((t) => t.name === 'appdock_tts_speak').inputSchema.properties.instructions.type,
      'string',
    );
    const listedVoices = await call('appdock_tts_list_voices');
    assert.equal(listedVoices.source, 'manual');
    assert.deepEqual(listedVoices.voices, (await snapshot()).settings.value.tts.manualVoices);
    const a = await call('appdock_tts_speak', {
      text: 'MCP音声テスト。',
      speed: 1.4,
      requestId: 'mcp-a',
      instructions: 'MCPのニュアンス',
    });
    assert.equal(
      (
        await call('appdock_tts_speak', {
          text: 'MCP音声テスト。',
          speed: 1.4,
          requestId: 'mcp-a',
          instructions: 'MCPのニュアンス',
        })
      ).jobId,
      a.jobId,
    );
    await until(async () => (await state(a)).state === 'completed', 'MCP completed');
    assert.equal(
      requests.at(-1).body.generation.instruct,
      alwaysInstructions + '\nMCPのニュアンス',
    );
    const empty = await call('appdock_tts_speak', {
      text: '指定なし',
      requestId: 'mcp-empty',
      instructions: '',
    });
    await until(async () => (await state(empty)).state === 'completed', 'empty override completed');
    assert.deepEqual(requests.at(-1).body.generation, {
      temperature: 0.4,
      instruct: alwaysInstructions,
    });
    assert.equal(requests.at(-1).body.language, 'Japanese');
    const conflicting = await client.callTool({
      name: 'appdock_tts_speak',
      arguments: {
        text: 'MCP音声テスト。',
        speed: 1.4,
        requestId: 'mcp-a',
        instructions: '別のニュアンス',
      },
    });
    assert(conflicting.isError);
    checks.push('MCP voice, speech, status and deduplication');
    const detailSummary = page.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' });
    if (!(await detailSummary.evaluate((e) => e.parentElement.open)))
      await detailSummary.press('Enter');
    const nuanceMode = page.getByLabel('ニュアンスの送信方式', { exact: true });
    await nuanceMode.selectOption('none');
    await settleSettings(page);
    const previewJobs = async () =>
      page.evaluate(async () => {
        const model = await window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        );
        return model.content.auxiliary.tts.jobs;
      });
    const previousPreview = (await previewJobs()).at(-1)?.jobId;
    await page.getByRole('button', { name: '試聴する', exact: true }).click();
    await until(async () => {
      const job = (await previewJobs()).at(-1);
      return job && job.jobId !== previousPreview && job.state === 'completed';
    }, 'preview ignores disabled default nuance');
    assert.deepEqual(requests.at(-1).body.generation, { temperature: 0.4 });
    assert.equal(requests.at(-1).body.language, 'Japanese');
    const ignored = await call('appdock_tts_speak', {
      text: 'ニュアンスを無視する音声テスト。',
      requestId: 'mcp-ignored-instructions',
      instructions: '送信しないニュアンス',
    });
    await until(
      async () => (await state(ignored)).state === 'completed',
      'MCP ignores disabled nuance',
    );
    assert.deepEqual(requests.at(-1).body.generation, { temperature: 0.4 });
    assert.equal(requests.at(-1).body.input, 'ニュアンスを無視する音声テスト。');
    assert.equal((await snapshot()).settings.value.tts.defaultInstructions, 'やさしく、落ち着いて');
    await nuanceMode.selectOption('json');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.alwaysInstructions, alwaysInstructions);
    checks.push('disabled nuance is ignored for settings preview and MCP while speech completes');
    await page.getByLabel('常に付与するニュアンス', { exact: true }).fill('');
    await page.getByLabel('常に付与するニュアンス', { exact: true }).press('Enter');
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.tts.alwaysInstructions, '');
    const cleared = await call('appdock_tts_speak', {
      text: '常時付与なし',
      instructions: ' \n ',
      requestId: 'always-cleared',
    });
    await until(
      async () => (await state(cleared)).state === 'completed',
      'cleared always nuance completed',
    );
    assert.deepEqual(requests.at(-1).body.generation, { temperature: 0.4 });
    checks.push(
      'always nuance saves and cancels, survives restart, combines with preview and SDK/MCP overrides, and can be cleared',
    );
    const long = await call('appdock_tts_speak', { text: 'long', requestId: 'long' });
    await until(async () => (await state(long)).state === 'playing', 'long playback');
    const audioPage = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('data:text/html')),
      'audio page',
    );
    const media = await audioPage.evaluate(() => ({
      rate: document.querySelector('audio').playbackRate,
      pitch: document.querySelector('audio').preservesPitch,
    }));
    assert.equal(media.rate, 1.4);
    assert.equal(media.pitch, true);
    assert.equal((await call('appdock_tts_stop', { jobId: long.jobId })).state, 'canceled');
    checks.push('31-second WAV playback and stop');
    const revoked = await call('appdock_tts_speak', { text: 'long', requestId: 'revoke' });
    await until(async () => (await state(revoked)).state === 'playing', 'revoke playing');
    await host.evaluate(() => window.dock.automation({ kind: 'setTts', allowed: false }));
    assert.equal((await state(revoked)).state, 'canceled');
    checks.push('MCP permission cancellation keeps status available');
    if (process.env.APPDOCK_TTS_REAL === '1') {
      await configure({
        baseUrl: 'http://alice:8080/v1',
        model: '1.7B-Base',
        defaultVoice: 'yui',
        speedMode: 'playback',
        defaultInstructions: '',
      });
      await host.evaluate(() => window.dock.automation({ kind: 'setTts', allowed: true }));
      for (const voice of ['yui', 'yui-quietgirl']) {
        const j = await call('appdock_tts_speak', {
          text: '音声連携の動作確認です。',
          voice,
          speed: 1.4,
          requestId: 'real-' + voice,
        });
        const ended = await until(
          async () => {
            const s = await state(j);
            return ['completed', 'failed'].includes(s.state) && s;
          },
          'real ' + voice,
          190000,
        );
        assert.equal(ended.state, 'completed', JSON.stringify(ended));
        checks.push('real server ' + voice + ' playback completion at 1.4');
      }
    }
    await configure({
      baseUrl: settings.tts.baseUrl,
      model: 'test',
      defaultVoice: 'voice-a',
      speedMode: 'playback',
    });
    await host.evaluate(() => window.dock.automation({ kind: 'setTts', allowed: true }));
    const shutdownJob = await call('appdock_tts_speak', {
      text: 'long',
      requestId: 'shutdown-playing',
    });
    await until(async () => (await state(shutdownJob)).state === 'playing', 'shutdown playback');
    checks.push('shutdown while audio is playing');
    await page.screenshot({ path: path.join(profile, 'settings.png') });
    const log = (await snapshot()).logs;
    assert(!JSON.stringify(log).includes('fixture-secret'));
    assert(!JSON.stringify(log).includes('MCPのニュアンス'));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ checks, portable: !!process.argv[2] }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } finally {
    let shutdownError;
    if (client) await client.close();
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child)
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch (e) {
        shutdownError = e;
        child.kill();
      }
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    if (shutdownError) throw shutdownError;
  }
})().catch((e) => {
  fs.writeFileSync(path.join(profile, 'error.txt'), e.stack || String(e));
  console.error(e);
  process.exitCode = 1;
});
