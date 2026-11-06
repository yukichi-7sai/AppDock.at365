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
      {
        ...s.settings.value,
        tts: {
          ...s.settings.value.tts,
          connections: s.settings.value.tts.connections.map((c) =>
            c.id === s.settings.value.tts.defaultConnectionId ? { ...c, ...patch } : c,
          ),
        },
      },
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
    settings.updates.checkHostOnAboutOpen = false;
    settings.updates.checkHostOnStartup = false;
    settings.updates.checkAppletsOnStartup = false;
    settings.host.hardwareAcceleration = false;
    settings.host.notifications = false;
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.tts = {
      defaultConnectionId: 'default',
      connections: [
        {
          ...require('../out/main/shared/tts').newTtsServer('default'),
          name: 'Primary',
          mcpEnabled: true,
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          model: 'test',
          defaultVoice: 'voice-a',
          // A pre-upgrade profile must retain the connection and use normal playback.
          defaultSpeed: 1.4,
          speedMode: 'server',
        },
      ],
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
          minimumHostVersion: '0.156.0',
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
          `exports.activate=async c=>c.commands.register('fixture.tts-node.speak','TTS probe',async()=>{let r;try{await c.appdock.call('tts.connections.list');const j=await c.appdock.call('tts.speak',{text:'SDK音声テスト。',connectionId:'default',instructions:'Nodeのニュアンス',requestId:require('node:crypto').randomUUID()});r={ok:true,...await c.appdock.call('tts.jobs.get',{jobId:j.jobId})};}catch(e){r={code:e.code};}await c.log.info('tts-probe:'+JSON.stringify(r));});`,
        );
    }
    require('./test-settings.cjs').write(profile, settings, local);
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
    const { alwaysInstructions, keyfile, setNuanceMode, setAlwaysInstructions } =
      await require('./tts-server-ui-checks.cjs')({
        page,
        host,
        snapshot,
        until,
        configure,
        requests,
        checks,
        settings,
        profile,
        local,
        inspector,
        inspect,
        electronExpression,
        restart: async () => {
          await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
          await until(() => child.exitCode !== null, 'restart exit');
          await browser.close();
          await launch();
          await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
          page = await settingsPage(host);
          await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
          return page;
        },
      });
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
    const speakSchema = tools.find((t) => t.name === 'appdock_tts_speak').inputSchema;
    assert.equal(speakSchema.properties.voice, undefined);
    assert.equal(speakSchema.properties.speed, undefined);
    assert.equal(speakSchema.properties.connectionId.type, 'string');
    const requestsBeforeInvalid = requests.length;
    const invalidSpeed = await client.callTool({
      name: 'appdock_tts_speak',
      arguments: { text: 'invalid speed', requestId: 'retired-speed', speed: 1.5 },
    });
    assert.equal(invalidSpeed.isError, true);
    assert.equal(requests.length, requestsBeforeInvalid);
    const connections = await call('appdock_tts_list_connections');
    assert.deepEqual(
      connections.connections,
      (await snapshot()).settings.value.tts.connections.map(({ id, name }) => ({ id, name })),
    );
    assert.equal(connections.defaultConnectionId, 'default');
    const listedVoices = await call('appdock_tts_list_voices');
    assert.equal(listedVoices.source, 'manual');
    assert.deepEqual(
      listedVoices.voices,
      (await snapshot()).settings.value.tts.connections[0].manualVoices,
    );
    const a = await call('appdock_tts_speak', {
      text: 'MCP音声テスト。',
      connectionId: 'default',
      requestId: 'mcp-a',
      instructions: 'MCPのニュアンス',
    });
    assert.equal(
      (
        await call('appdock_tts_speak', {
          text: 'MCP音声テスト。',
          connectionId: 'default',
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
        connectionId: 'default',
        requestId: 'mcp-a',
        instructions: '別のニュアンス',
      },
    });
    assert(conflicting.isError);
    assert.equal(conflicting.structuredContent.code, 'TTS_REQUEST_CONFLICT');
    checks.push('MCP voice, speech, status and deduplication');
    await setNuanceMode('none');
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
    assert.equal(
      (await snapshot()).settings.value.tts.connections[0].defaultInstructions,
      'やさしく、落ち着いて',
    );
    await setNuanceMode('json');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.tts.connections[0].alwaysInstructions,
      alwaysInstructions,
    );
    checks.push('disabled nuance is ignored for settings preview and MCP while speech completes');
    await setAlwaysInstructions('');
    assert.equal((await snapshot()).settings.value.tts.connections[0].alwaysInstructions, '');
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
      'always nuance survives restart, combines with preview and SDK/MCP overrides, and can be cleared',
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
    }));
    assert.equal(media.rate, 1);
    assert.equal((await call('appdock_tts_stop', { jobId: long.jobId })).state, 'canceled');
    checks.push('31-second WAV playback and stop');
    const presetRevoked = await call('appdock_tts_speak', {
      text: 'long',
      requestId: 'preset-revoke',
    });
    await until(
      async () => (await state(presetRevoked)).state === 'playing',
      'preset revoke playing',
    );
    await configure({ mcpEnabled: false });
    await until(async () => (await state(presetRevoked)).state === 'canceled', 'preset revoked');
    assert.deepEqual((await call('appdock_tts_list_connections')).connections, []);
    const presetDenied = await client.callTool({
      name: 'appdock_tts_speak',
      arguments: { text: 'blocked', requestId: 'preset-denied' },
    });
    assert.equal(presetDenied.structuredContent.code, 'API_DISABLED');
    await configure({ mcpEnabled: true });
    checks.push(
      'per-preset MCP revoke cancels playback, hides connections and rejects the default',
    );
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
        defaultInstructions: '',
      });
      await host.evaluate(() => window.dock.automation({ kind: 'setTts', allowed: true }));
      for (const voice of ['yui', 'yui-quietgirl']) {
        await configure({ defaultVoice: voice });
        const j = await call('appdock_tts_speak', {
          text: '音声連携の動作確認です。',
          connectionId: 'default',
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
        checks.push('real server ' + voice + ' playback completion at normal speed');
      }
    }
    await configure({
      baseUrl: settings.tts.connections[0].baseUrl,
      model: 'test',
      defaultVoice: 'voice-a',
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
