const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright'),
  { parse } = require('smol-toml');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', `ai-ui-${Date.now()}`),
  local = path.join(profile, 'local');
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  requests = [],
  modelRequests = [];
let child, browser, host, client, server;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await pause(50);
  }
  throw Error(label);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError)
    throw Object.assign(Error(r.structuredContent?.message ?? JSON.stringify(r)), {
      code: r.structuredContent?.code,
    });
  return r.structuredContent;
}
async function errorNoticeFor(caller) {
  return until(async () => {
    for (const surface of browser
      .contexts()
      .flatMap((c) => c.pages())
      .filter((p) => p.url().endsWith('/shells/default/notifications.html'))) {
      const m = await surface.evaluate(() => window.appdockNotifications.connect());
      const item = m.snapshot.items.find(
        (n) =>
          n.ownerId === 'errors' && n.body.includes('AI_OUTPUT_LIMIT') && n.body.includes(caller),
      );
      if (!item) continue;
      await surface.evaluate(
        (item) =>
          window.appdockNotifications.act({
            notificationId: item.id,
            revision: item.revision,
            requestId: crypto.randomUUID(),
            type: 'dismiss',
          }),
        item,
      );
      return item;
    }
  }, 'common error banner for ' + caller);
}
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/models')) {
        modelRequests.push({ url: req.url, auth: req.headers.authorization });
        if (req.url.startsWith('/slow/')) await pause(600);
        if (req.url.startsWith('/invalid/')) {
          res.writeHead(404);
          res.end('{}');
          return;
        }
        res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
        return;
      }
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      requests.push({ body, auth: req.headers.authorization });
      if (body.messages.at(-1).content === 'token-limit') {
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'length',
                message: { content: '', reasoning: 'private-fixture-reasoning' },
              },
            ],
          }),
        );
        return;
      }
      if (body.messages.at(-1).content === 'slow') {
        await pause(2000);
        if (res.destroyed) return;
      }
      res.end(
        JSON.stringify({
          choices: [
            { finish_reason: 'stop', message: { content: '架空の入力から生成した短い文章です。' } },
          ],
        }),
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { newAiConnection } = require('../out/main/shared/ai');
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.host.hardwareAcceleration = false;
    settings.host.notifications = false;
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.notificationPreferences = {
      overrides: [
        {
          ownerKind: 'host',
          ownerId: 'errors',
          typeId: 'operation-failed',
          targets: [],
          durationSeconds: 60,
        },
      ],
    };
    settings.ai = {
      commonPrompt: '共通の架空指示',
      defaultConnectionId: 'preview',
      connections: ['preview', 'sdk', 'mcp'].map((id) => ({
        ...newAiConnection(id),
        name: id,
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        defaultModel: 'fixture-model',
        authentication: id === 'preview' ? 'bearer' : 'none',
      })),
    };
    for (const [id, dotnet] of [
      ['fixture.ai-node', false],
      ['fixture.ai-dotnet', true],
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
          entry: dotnet ? 'AppDock.Extensions.AiProbe.dll' : 'index.cjs',
          ...(dotnet ? { type: 'AppDock.Extensions.AiProbe.AiProbe' } : {}),
          capabilities: ['appdock-api'],
          commands: [{ id: id + '.generate', title: 'AI probe', automation: true }],
        }),
      );
      settings.extensions[id] = { enabled: true, settings: {} };
      if (dotnet)
        fs.copyFileSync(
          path.join(
            root,
            'tests/fixtures/dotnet/AppDock.Extensions.AiProbe/bin/Release/net10.0/AppDock.Extensions.AiProbe.dll',
          ),
          path.join(dir, 'AppDock.Extensions.AiProbe.dll'),
        );
      else
        fs.writeFileSync(
          path.join(dir, 'index.cjs'),
          `exports.activate=async c=>c.commands.register('${id}.generate','AI probe',async()=>{let r;try{await c.appdock.call('ai.models.list',{connectionId:'sdk'});const j=await c.appdock.call('ai.text.generate',{connectionId:'sdk',model:'node-model',additionalPrompt:'用途の架空指示',input:'架空の入力',requestId:require('node:crypto').randomUUID()});let v;do{await new Promise(r=>setTimeout(r,50));v=await c.appdock.call('ai.jobs.get',{jobId:j.jobId});}while(['queued','running'].includes(v.state));r={ok:v.state==='completed',jobId:j.jobId};}catch(e){r={code:e.code};}await c.log.info('ai-probe:'+JSON.stringify(r));});`,
        );
    }
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const mainPort = await freePort();
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
        `--inspect=${mainPort}`,
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
          .filter((e) => e.id.startsWith('fixture.ai-'))
          .every((e) => e.state === 'running')
      );
    }, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    let page = await settingsPage(host);
    await page.getByRole('button', { name: '通知', exact: true }).click();
    await page.getByRole('switch', { name: 'エラー通知を通知', exact: true }).waitFor();
    assert.equal(await page.locator('[aria-label="AppDockの通知"]').count(), 1);
    const errorToggle = page.getByRole('switch', { name: 'エラー通知を通知', exact: true });
    const errorBanner = page.getByLabel('エラー通知のバナー', { exact: true });
    const centerOnly = page.getByLabel('エラー通知の通知センターのみ', { exact: true });
    assert.equal(await errorToggle.isEnabled(), true);
    assert.equal(await errorBanner.isChecked(), true);
    assert.equal(await errorBanner.isDisabled(), true);
    assert.equal(await centerOnly.isChecked(), false);
    assert.equal(await centerOnly.isDisabled(), true);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).notificationPreferences
        .overrides[0].targets,
      [],
    );
    await errorToggle.click();
    await settleSettings(host);
    await until(
      async () =>
        (await snapshot()).settings.value.notificationPreferences.overrides.find(
          (r) => r.ownerId === 'errors',
        )?.enabled === false,
      'error notifications off',
    );
    assert.equal(await page.getByText('この種類の通知はオフです。', { exact: true }).count(), 0);
    assert.equal(await errorBanner.isChecked(), true);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(path.join(profile, 'settings.json')),
      ).notificationPreferences.overrides.find((r) => r.ownerId === 'errors').targets,
      ['banner'],
    );
    await errorToggle.click();
    await settleSettings(host);
    await until(
      async () =>
        (await snapshot()).settings.value.notificationPreferences.overrides.find(
          (r) => r.ownerId === 'errors',
        )?.enabled === true,
      'error notifications on',
    );
    await page.getByLabel('エラー通知のデスクトップ通知', { exact: true }).check();
    await settleSettings(host);
    await until(
      async () =>
        (await snapshot()).settings.value.notificationPreferences.overrides
          .find((r) => r.ownerId === 'errors')
          ?.targets.includes('desktop'),
      'optional desktop added',
    );
    await page.getByLabel('エラー通知のデスクトップ通知', { exact: true }).uncheck();
    await settleSettings(host);
    await until(
      async () =>
        (await snapshot()).settings.value.notificationPreferences.overrides.find(
          (r) => r.ownerId === 'errors',
        )?.targets.length === 1,
      'optional desktop removed',
    );
    await page
      .locator('[aria-label="AppDockの通知"]')
      .screenshot({ path: path.join(profile, 'error-notification-settings.png') });
    checks.push(
      'required banner cannot be unchecked or replaced by center-only; independent off/on and legacy preference edits work without an off-status message',
    );
    assert.equal(
      await page.getByLabel('エラー通知を読み上げる', { exact: true }).isChecked(),
      false,
    );
    checks.push('one AppDock notification section includes configurable errors with speech off');
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await page.getByLabel('共通プロンプト', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('共通プロンプト', { exact: true }).inputValue(),
      '共通の架空指示',
    );

    const settingsFile = path.join(profile, 'settings.json');
    const before = fs.readFileSync(settingsFile, 'utf8');
    assert.equal(await page.getByLabel('このPCでAI接続を使用', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('summary').click();
    assert.equal(await dialog.getByLabel('AIの既定の出力トークン上限').inputValue(), '8192');
    assert.equal(await dialog.getByLabel('AIの既定の待ち時間（秒）').inputValue(), '60');
    await dialog.getByLabel('AIの既定の出力トークン上限').fill('100000');
    await dialog.getByLabel('AIの既定の待ち時間（秒）').fill('120');
    await dialog.getByLabel('AIのAPIのURL', { exact: true }).fill('http:');
    assert.equal(await dialog.getByLabel('AIのAPIのURL').inputValue(), 'http:');
    await dialog.getByLabel('AIのAPIのURL').fill('http://');
    assert.equal(await dialog.getByLabel('AIのAPIのURL').inputValue(), 'http://');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
    assert(!fs.existsSync(path.join(local, 'ai-keys.json')));
    await until(
      () =>
        page
          .getByRole('button', { name: 'AIサーバーを追加', exact: true })
          .evaluate((el) => el === document.activeElement),
      'focus restored',
    );
    checks.push('add/cancel preserves disk, incomplete URL and focus return');

    await page.getByRole('button', { name: 'previewの設定', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('AIのAPIキー', { exact: true }).fill('fixture-ai-secret');
    await dialog.getByLabel('AIのAPIキー', { exact: true }).press('Enter');
    await dialog.getByText(/1件のモデルを取得しました/).waitFor();
    assert.equal(modelRequests.at(-1).auth, 'Bearer fixture-ai-secret');
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
    assert(!fs.existsSync(path.join(local, 'ai-keys.json')));
    const count = modelRequests.length;
    const url = dialog.getByLabel('AIのAPIのURL', { exact: true });
    await url.fill(settings.ai.connections[0].baseUrl + '///');
    await url.dispatchEvent('compositionstart');
    await url.dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
      keyCode: 229,
    });
    await pause(120);
    assert.equal(modelRequests.length, count);
    await url.dispatchEvent('compositionend', { data: '/' });
    await url.press('Enter');
    await until(() => modelRequests.length === count + 1, 'URL Enter discovery');
    await dialog.getByText(/1件のモデルを取得しました/).waitFor();
    assert.equal(await url.inputValue(), settings.ai.connections[0].baseUrl);
    await url.blur();
    await pause(100);
    assert.equal(modelRequests.length, count + 1);
    await dialog.getByRole('button', { name: 'モデル一覧を取得', exact: true }).click();
    await until(() => modelRequests.length === count + 2, 'model button discovery');
    await dialog.getByText(/1件のモデルを取得しました/).waitFor();
    const revision = (await snapshot()).settings.revision;
    await dialog.locator('summary').click();
    await dialog.getByLabel('AIの既定の出力トークン上限').fill('131073');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.getByText(/既定の出力トークン上限は/).waitFor();
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
    await dialog.getByLabel('AIの既定の出力トークン上限').fill('100000');
    await dialog.getByLabel('AIの既定の待ち時間（秒）').fill('601');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.getByText(/既定の待ち時間は/).waitFor();
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
    await dialog.getByLabel('AIの既定の待ち時間（秒）').fill('120');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(
      () =>
        page
          .getByRole('dialog')
          .count()
          .then((n) => n === 0),
      'saved dialog closed',
    );
    assert.equal((await snapshot()).settings.revision, revision + 1);
    assert.equal(
      JSON.parse(fs.readFileSync(settingsFile, 'utf8')).ai.connections[0].defaultMaxOutputTokens,
      100000,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(settingsFile, 'utf8')).ai.connections[0].defaultTimeoutSeconds,
      120,
    );
    assert(
      !fs.readFileSync(path.join(local, 'ai-keys.json'), 'utf8').includes('fixture-ai-secret'),
    );
    assert(!fs.existsSync(path.join(local, 'ai-access.json')));
    assert(
      !JSON.stringify(await page.evaluate(() => window.appdockPage.connect())).includes(
        'fixture-ai-secret',
      ),
    );
    checks.push(
      'URL/key Enter and model button discover from local draft, IME ignored, one OK saves encrypted key/config',
    );

    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('AI接続の名前').fill('追加したサーバー');
    await dialog.getByLabel('AIのAPIのURL').fill(settings.ai.connections[0].baseUrl);
    await dialog.getByLabel('AIの既定モデル').fill('manual-model');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: '追加したサーバーの設定', exact: true }).waitFor();
    await page.getByRole('button', { name: '追加したサーバーの設定', exact: true }).click();
    await page.getByRole('dialog').getByLabel('AI接続の名前').fill('編集中の名前');
    assert.equal((await snapshot()).settings.value.ai.connections.at(-1).name, '追加したサーバー');
    await page.getByRole('dialog').press('Escape');
    await page.getByRole('button', { name: '追加したサーバーを削除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal((await snapshot()).settings.value.ai.connections.length, 4);
    await page.getByRole('button', { name: '追加したサーバーを削除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
    await until(
      async () => (await snapshot()).settings.value.ai.connections.length === 3,
      'confirmed removal',
    );
    checks.push('add commits all fields, edit Escape cancels, deletion requires confirmation');

    await page.getByRole('button', { name: 'AIサーバーを並べ替え', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('mcpの順番をドラッグで変更')
      .dragTo(dialog.locator('[data-order-id="preview"]'));
    assert.deepEqual(
      (await snapshot()).settings.value.ai.connections.map((c) => c.id),
      ['preview', 'sdk', 'mcp'],
    );
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(
      async () => (await snapshot()).settings.value.ai.connections[0].id === 'mcp',
      'drag order saved',
    );
    await page.getByRole('button', { name: 'AIサーバーを並べ替え', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('mcpの順番をドラッグで変更').press('Alt+ArrowDown');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.deepEqual(
      (await snapshot()).settings.value.ai.connections.map((c) => c.id),
      ['mcp', 'preview', 'sdk'],
    );
    checks.push('drag reordering saves on OK, keyboard reorder cancel preserves saved order');

    await page
      .locator('details')
      .filter({ has: page.getByRole('heading', { name: '文章生成の試験', exact: true }) })
      .locator(':scope > summary')
      .click();
    await page.getByLabel('試験するAIサーバー').selectOption('preview');
    await page.getByLabel('試験のAIモデル', { exact: true }).fill('override-model');
    await page.getByLabel('試験の追加プロンプト', { exact: true }).fill('用途別の架空指示');
    await page.getByLabel('試験の入力データ', { exact: true }).fill('架空の入力');
    await page.getByRole('button', { name: '文章を生成', exact: true }).click();
    await page.getByText('架空の入力から生成した短い文章です。', { exact: true }).waitFor();
    assert.equal(requests[0].body.model, 'override-model');
    assert.equal(requests[0].body.max_tokens, 100000);
    assert.equal(requests[0].auth, 'Bearer fixture-ai-secret');
    assert.equal(requests[0].body.messages[1].content, '架空の入力');
    checks.push('generation works immediately after registration without connection approval');
    await page.getByLabel('試験の入力データ', { exact: true }).fill('token-limit');
    await page.getByRole('button', { name: '文章を生成', exact: true }).click();
    await page.getByText(/出力トークンの上限に達したため/).waitFor();
    const errorNotice = await errorNoticeFor('試験画面');
    assert.equal(errorNotice.title, 'AI文章生成に失敗しました');
    assert(
      (await snapshot()).logs.some(
        (l) => l.level === 'error' && l.message.includes('AI_OUTPUT_LIMIT'),
      ),
    );
    checks.push(
      'preview uses saved token default; token exhaustion appears in result, common notification and error log',
    );
    await host.evaluate(() =>
      window.dock.setAppletApiPermissions({ read: true, execute: true, useAi: true }),
    );
    for (const id of ['fixture.ai-node', 'fixture.ai-dotnet']) {
      await host.evaluate((id) => window.dock.executeCommand(id + '.generate'), id);
      const result = await until(async () => {
        const log = (await snapshot()).logs.find(
          (l) => l.source === id && l.message.startsWith('ai-probe:'),
        );
        return log && JSON.parse(log.message.slice(9));
      }, id + ' result');
      assert.equal(result.ok, true);
      checks.push(id + ' real SDK/RPC generated');
    }
    assert(requests.some((r) => r.body.model === 'node-model'));
    assert(requests.some((r) => r.body.model === 'dotnet-model'));
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
      await window.dock.automation({ kind: 'register' });
    }, configFile);
    const mcp = (await host.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
    const headers = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[mcp.serverId]
      .http_headers;
    client = new Client({ name: 'AI integration', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcp.endpoint), { requestInit: { headers } }),
    );
    const tools = (await client.listTools()).tools;
    for (const name of [
      'appdock_ai_generate_text',
      'appdock_ai_get_job',
      'appdock_ai_cancel_job',
      'appdock_ai_list_models',
    ])
      assert(tools.some((t) => t.name === name));
    const denied = await client.callTool({
      name: 'appdock_ai_generate_text',
      arguments: { requestId: 'denied', connectionId: 'mcp', input: '架空の入力' },
    });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.code, 'API_DISABLED');
    await host.evaluate(() => window.dock.automation({ kind: 'setAi', allowed: true }));
    assert.equal(
      (await call('appdock_ai_list_models', { connectionId: 'mcp' })).models[0].id,
      'fixture-model',
    );
    const request = {
      requestId: 'mcp-one',
      connectionId: 'mcp',
      model: 'mcp-model',
      additionalPrompt: 'MCPの用途指示',
      input: '架空の入力',
    };
    const accepted = await call('appdock_ai_generate_text', request);
    assert.equal((await call('appdock_ai_generate_text', request)).jobId, accepted.jobId);
    await until(
      async () =>
        (await call('appdock_ai_get_job', { jobId: accepted.jobId })).state === 'completed',
      'MCP completed',
    );
    const log = (await snapshot()).logs.find(
      (l) => l.source === 'fixture.ai-node' && l.message.startsWith('ai-probe:'),
    );
    const foreign = JSON.parse(log.message.slice(9)).jobId;
    const foreignReply = await client.callTool({
      name: 'appdock_ai_get_job',
      arguments: { jobId: foreign },
    });
    assert.equal(foreignReply.structuredContent.code, 'NOT_FOUND');
    const cancel = await call('appdock_ai_generate_text', {
      requestId: 'mcp-cancel',
      connectionId: 'mcp',
      input: 'slow',
    });
    assert.equal((await call('appdock_ai_cancel_job', { jobId: cancel.jobId })).state, 'canceled');
    checks.push(
      'MCP discovery, separate permission, generate/get/cancel, deduplication and owner isolation',
    );
    const failureRequest = {
      requestId: 'mcp-output-limit',
      connectionId: 'mcp',
      input: 'token-limit',
      maxOutputTokens: 131072,
      timeoutMs: 600000,
    };
    const failed = await call('appdock_ai_generate_text', failureRequest);
    await until(
      async () => (await call('appdock_ai_get_job', { jobId: failed.jobId })).state === 'failed',
      'MCP token error',
    );
    const failedResult = await call('appdock_ai_get_job', { jobId: failed.jobId });
    assert.equal(failedResult.error.code, 'AI_OUTPUT_LIMIT');
    assert.equal((await call('appdock_ai_generate_text', failureRequest)).jobId, failed.jobId);
    assert.equal(requests.at(-1).body.max_tokens, 131072);
    await until(
      async () =>
        (await snapshot()).logs.some(
          (l) => l.message.includes(failed.jobId) && l.message.includes('実行元: MCP'),
        ),
      'MCP error log',
    );
    assert.equal(
      (await snapshot()).logs.filter((l) => l.level === 'error' && l.message.includes(failed.jobId))
        .length,
      1,
    );
    await errorNoticeFor('MCP');
    checks.push(
      'MCP accepts expanded overrides and emits one common error log on terminal failure',
    );
    await host.evaluate(() => window.dock.automation({ kind: 'setAi', allowed: false }));
    const revoked = await client.callTool({
      name: 'appdock_ai_get_job',
      arguments: { jobId: accepted.jobId },
    });
    assert.equal(revoked.structuredContent.code, 'NOT_FOUND');
    await host.evaluate(() => window.dock.automation({ kind: 'setAi', allowed: true }));
    await host.evaluate(async () => {
      await window.dock.automation({ kind: 'rotateToken' });
      await window.dock.automation({ kind: 'register' });
    });
    await client.close();
    const rotatedHeaders = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[mcp.serverId]
      .http_headers;
    client = new Client({ name: 'AI integration after rotation', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcp.endpoint), {
        requestInit: { headers: rotatedHeaders },
      }),
    );
    const oldJob = await client.callTool({
      name: 'appdock_ai_get_job',
      arguments: { jobId: accepted.jobId },
    });
    assert.equal(oldJob.structuredContent.code, 'NOT_FOUND');
    checks.push('MCP permission revocation and token rotation reclaim prior jobs');
    await page.getByLabel('試験するAIサーバー', { exact: true }).selectOption('preview');
    await page.getByLabel('試験の入力データ', { exact: true }).fill('slow');
    await page.getByRole('button', { name: '文章を生成', exact: true }).click();
    await until(async () => {
      const m = (await page.evaluate(() => window.appdockPage.connect())).snapshot;
      return m.content.auxiliary.ai.jobs.at(-1)?.state === 'running';
    }, 'slow started');
    await page.getByLabel('共通プロンプト', { exact: true }).fill('変更後の共通方針');
    await settleSettings(page);
    await until(async () => {
      const m = (await page.evaluate(() => window.appdockPage.connect())).snapshot;
      return m.content.auxiliary.ai.jobs.at(-1)?.state === 'canceled';
    }, 'old prompt canceled');
    checks.push('common prompt changes cancel old jobs');
    await page.getByRole('button', { name: 'previewの設定', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('AIのAPIのURL')
      .fill(settings.ai.connections[0].baseUrl.replace('/v1', '/changed/v1'));
    await dialog.getByLabel('AIのAPIのURL').press('Enter');
    await dialog.getByText(/再入力が必要/).waitFor();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push('a changed endpoint cannot reuse the saved key during discovery');
    await page
      .locator('details')
      .filter({ has: page.getByRole('heading', { name: '文章生成の試験', exact: true }) })
      .locator(':scope > summary')
      .click();

    await page.getByRole('button', { name: 'sdkの設定', exact: true }).click();
    dialog = page.getByRole('dialog');
    const draftUrl = dialog.getByLabel('AIのAPIのURL');
    await draftUrl.fill(settings.ai.connections[0].baseUrl.replace('/v1', '/invalid/v1'));
    await draftUrl.press('Enter');
    await dialog.getByText(/モデル一覧に対応していません/).waitFor();
    await draftUrl.fill(settings.ai.connections[0].baseUrl.replace('/v1', '/slow/v1'));
    const startedModels = modelRequests.length;
    await draftUrl.press('Enter');
    await until(() => modelRequests.length > startedModels, 'slow list started');
    await draftUrl.fill(settings.ai.connections[0].baseUrl);
    await until(
      () => dialog.getByRole('button', { name: 'モデル一覧を取得', exact: true }).isEnabled(),
      'slow list settled',
    );
    assert.equal(await dialog.getByText(/モデルを取得しました/).count(), 0);
    await draftUrl.press('Enter');
    await dialog.getByText(/1件のモデルを取得しました/).waitFor();
    await dialog.getByLabel('AI接続の名前').fill('local-draft');
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.ai.connections.find((c) => c.id === 'sdk').name = 'sdk-external';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.getByText(/別の場所で変更されました/).waitFor();
    assert.equal(await dialog.getByLabel('AI接続の名前').inputValue(), 'local-draft');
    assert.equal(
      (await snapshot()).settings.value.ai.connections.find((c) => c.id === 'sdk').name,
      'sdk-external',
    );
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: 'sdk-externalの設定', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('AI接続の名前').fill('sdk');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(
      () =>
        page
          .getByRole('dialog')
          .count()
          .then((n) => n === 0),
      'retry saved',
    );
    checks.push(
      'unsupported model lists remain editable, stale responses are discarded, conflicting edits preserve the local draft and can be reopened',
    );
    for (const [theme, width] of [
      ['dark', 1280],
      ['light', 760],
    ]) {
      await host.evaluate(
        async ({ theme, width }) => {
          const s = await window.dock.snapshot();
          await window.dock.saveSettings(
            { ...s.settings.value, host: { ...s.settings.value.host, theme } },
            s.settings.revision,
          );
        },
        { theme, width },
      );
      // Resize the actual native window via CDP, as in the existing settings tests.
      await inspect(
        mainPort,
        electronExpression +
          `.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/')).setSize(${width},850)`,
      );
      await pause(300);
      await page.locator('.settings-body').evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({ path: path.join(profile, `${theme}-${width}.png`) });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 2,
      );
      assert.equal(overflow, false);
      await page.getByRole('button', { name: 'previewの設定', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.screenshot({ path: path.join(profile, theme + '-' + width + '-dialog.png') });
      await dialog.locator('summary').click();
      await dialog.getByLabel('AIの保存指定').scrollIntoViewIfNeeded();
      assert(await dialog.getByRole('button', { name: 'OK', exact: true }).isVisible());
      assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 2), false);
      await dialog.screenshot({ path: path.join(profile, theme + '-' + width + '-advanced.png') });
      await dialog
        .getByLabel('AIの既定の出力トークン上限', { exact: true })
        .scrollIntoViewIfNeeded();
      await dialog.screenshot({ path: path.join(profile, theme + '-' + width + '-limits.png') });
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    }
    assert(!JSON.stringify((await snapshot()).logs).includes('fixture-ai-secret'));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, checks, requests: requests.length }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } catch (e) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), e.stack ?? String(e));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks }, null, 2),
    );
    if (browser)
      for (const pg of browser.contexts().flatMap((c) => c.pages()))
        if (pg.url().includes('settings'))
          console.log(
            await pg.evaluate(() => ({
              active: document.activeElement?.outerHTML.slice(0, 500),
              dialog: document.querySelector('dialog')?.outerHTML.slice(0, 300),
            })),
          );
    console.error(e.stack ?? e);
    console.log('Profile: ' + profile);
    process.exitCode = 1;
  } finally {
    await client?.close().catch(() => {});
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) {
      try {
        await until(() => child.exitCode !== null, 'shutdown', 15000);
      } catch {
        child.kill();
        await pause(400);
      }
    }
    await browser?.close().catch(() => {});
    await new Promise((r) => {
      if (server) {
        server.close(r);
        server.closeAllConnections();
      } else r();
    });
  }
})();
