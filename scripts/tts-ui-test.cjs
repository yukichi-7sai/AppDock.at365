const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright'),
  { parse } = require('smol-toml');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js'),
  { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
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
          runtime: dotnet ? 'dotnet' : 'node',
          entry: dotnet ? 'AppDock.Extensions.TtsProbe.dll' : 'index.cjs',
          ...(dotnet ? { type: 'AppDock.Extensions.TtsProbe.TtsProbe' } : {}),
          capabilities: ['appdock-api'],
          commands: [{ id: id + '.speak', title: 'TTS probe', automation: true }],
        }),
      );
      settings.extensions[id] = { enabled: true, settings: {} };
      if (dotnet)
        fs.copyFileSync(
          path.join(
            root,
            'tests/fixtures/dotnet/AppDock.Extensions.TtsProbe/bin/Release/net10.0/AppDock.Extensions.TtsProbe.dll',
          ),
          path.join(dir, 'AppDock.Extensions.TtsProbe.dll'),
        );
      else
        fs.writeFileSync(
          path.join(dir, 'index.cjs'),
          `exports.activate=async c=>c.commands.register('fixture.tts-node.speak','TTS probe',async()=>{let r;try{await c.appdock.call('tts.voices.list');const j=await c.appdock.call('tts.speak',{text:'SDK音声テスト。',speed:1.4,requestId:require('node:crypto').randomUUID()});r={ok:true,...await c.appdock.call('tts.jobs.get',{jobId:j.jobId})};}catch(e){r={code:e.code};}await c.log.info('tts-probe:'+JSON.stringify(r));});`,
        );
    }
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let executable = require('electron'),
      args = [root];
    if (process.argv[2]) {
      executable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(path.resolve(process.argv[2]), executable);
      assert.equal(
        createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
        createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'),
      );
      args = [];
    }
    child = spawn(
      executable,
      [
        ...args,
        `--test-profile=${profile}`,
        `--test-local-state=${local}`,
        `--remote-debugging-port=${port}`,
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
    await until(async () => {
      const s = await snapshot();
      return (
        s.startupReady &&
        s.extensions
          .filter((e) => e.id.startsWith('fixture.tts-'))
          .every((e) => e.state === 'running')
      );
    }, 'startup');
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
            .filter((b) => b.textContent.trim() === 'TTS')
            .map((b) => ({ rect: b.getBoundingClientRect().toJSON(), html: b.outerHTML })),
        })),
        null,
        2,
      ),
    );
    await page.getByRole('button', { name: 'TTS', exact: true }).click();
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
    await page.getByText('APIキーをこのPCに保存しました。', { exact: true }).waitFor();
    const keyfile = path.join(local, 'tts-key.json');
    assert(!fs.readFileSync(keyfile, 'utf8').includes('fixture-secret'));
    assert(
      !JSON.stringify(await page.evaluate(() => window.appdockPage.connect())).includes(
        'fixture-secret',
      ),
    );
    checks.push('encrypted key and public model privacy');
    await page.getByLabel('読み上げ速度', { exact: true }).fill('1.4');
    await settleSettings(page);
    await page.getByLabel('試聴するテキスト', { exact: true }).fill('設定画面の音声テスト。');
    await page.getByRole('button', { name: '試聴する', exact: true }).click();
    await until(async () => {
      const m = (await page.evaluate(() => window.appdockPage.connect())).snapshot;
      return m.content.auxiliary.tts.jobs.at(-1)?.state === 'completed';
    }, 'preview ended');
    assert.equal(requests.at(-1).auth, 'Bearer fixture-secret');
    assert.equal(requests.at(-1).body.speed, 1);
    checks.push('settings preview ends and playback speed avoids double speed');
    await page.getByRole('button', { name: 'APIキーを削除', exact: true }).click();
    await page.getByText('APIキーを削除しました。', { exact: true }).waitFor();
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
    assert.equal((await call('appdock_tts_list_voices')).voices[0].id, 'voice-a');
    const a = await call('appdock_tts_speak', {
      text: 'MCP音声テスト。',
      speed: 1.4,
      requestId: 'mcp-a',
    });
    assert.equal(
      (await call('appdock_tts_speak', { text: 'MCP音声テスト。', speed: 1.4, requestId: 'mcp-a' }))
        .jobId,
      a.jobId,
    );
    await until(async () => (await state(a)).state === 'completed', 'MCP completed');
    checks.push('MCP voice, speech, status and deduplication');
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
