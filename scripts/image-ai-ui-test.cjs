const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'image-ai-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const png = require('../tests/fixtures/image-ai-png.cjs');
const requests = [],
  checks = [];
let host, server;
const check = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      let body = '';
      for await (const part of req) body += part;
      const input = JSON.parse(body);
      requests.push({ input, url: req.url, auth: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      if (input.prompt.includes('failure')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'private fixture' }));
        return;
      }
      res.end(
        JSON.stringify({
          data: Array.from({ length: input.n }, () => ({ b64_json: png.toString('base64') })),
        }),
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/v1`;
    const settings = createDefaultSettings();
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.updates = {
      ...settings.updates,
      checkHostOnStartup: false,
      checkAppletsOnStartup: false,
      checkHostOnAboutOpen: false,
    };
    const sdk = {
      ...newImageAiConnection('sdk'),
      name: 'SDK fixture',
      baseUrl: url,
      authentication: 'none',
      defaultModel: 'fixture',
      defaultPrompt: 'sdk image',
    };
    settings.imageAi = { connections: [sdk], defaultConnectionId: 'sdk' };
    const id = 'fixture.image-ai';
    const dir = path.join(profile, 'extensions', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['appdock-api'],
        commands: [{ id: id + '.generate', title: 'Image API probe' }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'index.cjs'),
      `exports.activate=async c=>c.commands.register('${id}.generate','Image API probe',async()=>{let result;try{const list=await c.appdock.call('ai.image.connections.list',{});const j=await c.appdock.call('ai.image.generate',{connectionId:'sdk',requestId:require('node:crypto').randomUUID()});let v;do{await new Promise(r=>setTimeout(r,30));v=await c.appdock.call('ai.image.jobs.get',{jobId:j.jobId});}while(['queued','running'].includes(v.state));if(v.state!=='completed')throw Error(JSON.stringify(v));let offset=0,parts=[];for(;;){const p=await c.appdock.call('ai.image.results.read',{jobId:j.jobId,imageId:v.images[0].id,offset});parts.push(Buffer.from(p.data,'base64'));offset=p.nextOffset;if(p.done)break;}result={ok:true,bytes:Buffer.concat(parts).length,connections:list.connections.length};}catch(e){result={code:e.code,message:e.message};}await c.log.info('image-api-probe:'+JSON.stringify(result));});`,
    );
    settings.extensions[id] = { enabled: true, settings: {} };
    const nativeId = 'fixture.image-ai-dotnet',
      nativeDir = path.join(profile, 'extensions', nativeId);
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.writeFileSync(
      path.join(nativeDir, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: nativeId,
        name: nativeId,
        version: '1.0.0',
        minimumHostVersion: '0.165.0',
        runtime: 'dotnet',
        entry: 'AppDock.Extensions.ImageAiProbe.dll',
        type: 'AppDock.Extensions.ImageAiProbe.ImageAiProbe',
        capabilities: ['appdock-api'],
        commands: [{ id: nativeId + '.generate', title: 'Image API probe' }],
      }),
    );
    require('./copy-host.cjs').copyHost(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.Extensions.ImageAiProbe/bin/Release/net10.0/AppDock.Extensions.ImageAiProbe.dll',
      ),
      path.join(nativeDir, 'AppDock.Extensions.ImageAiProbe.dll'),
    );
    settings.extensions[nativeId] = { enabled: true, settings: {} };
    fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
    host = await launch(profile, process.argv[2]);
    const page = host.main;
    await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      return ['fixture.image-ai', 'fixture.image-ai-dotnet'].every((id) =>
        s.extensions.some((e) => e.id === id && e.state === 'running'),
      );
    }, 'fixture applet');
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.image-ai.open'));
    await settingsPage(page);
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('登録名', { exact: true }).fill('Discard preset');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.imageAi.connections.length,
      1,
    );
    check('cancel leaves registrations and credentials untouched');
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('登録名', { exact: true }).fill('Preview preset');
    await dialog.getByLabel('APIのURL', { exact: true }).fill(url);
    await dialog.getByLabel('AIのAPIキー', { exact: true }).fill('fixture-api-key');
    await dialog.getByRole('tab', { name: '生成設定', exact: true }).click();
    await dialog.getByLabel('指定がないときのモデル', { exact: true }).fill('fixture');
    await dialog.getByLabel('画像サイズ', { exact: true }).fill('1536x1024');
    await dialog.getByRole('tab', { name: 'プロンプト', exact: true }).click();
    await dialog.getByLabel('いつも加えるプロンプト', { exact: true }).fill('always');
    await dialog.getByLabel('指定がないときのプロンプト', { exact: true }).fill('default image');
    await dialog.getByRole('tab', { name: '接続', exact: true }).click();
    assert.equal(await dialog.getByLabel('登録名', { exact: true }).inputValue(), 'Preview preset');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(
      async () =>
        (await page.evaluate(() => window.dock.snapshot())).settings.value.imageAi.connections
          .length === 2,
      'preset saved',
    );
    const saved = (
      await page.evaluate(() => window.dock.snapshot())
    ).settings.value.imageAi.connections.find((c) => c.name === 'Preview preset');
    assert(saved.id);
    assert.equal(saved.defaults.size, '1536x1024');
    assert(
      !JSON.stringify((await page.evaluate(() => window.dock.snapshot())).settings).includes(
        'fixture-api-key',
      ),
    );
    check('preset dialog saves connection and generation options atomically without exposing key');
    await page.getByLabel('試験するAIサーバー', { exact: true }).selectOption(saved.id);
    await page.getByLabel('画像の説明', { exact: true }).fill('fixture landscape');
    await page.getByRole('button', { name: '画像を生成', exact: true }).click();
    await until(
      async () =>
        page
          .locator('.image-ai-preview img')
          .evaluateAll(
            (imgs) => imgs.length === 1 && imgs.every((i) => i.complete && i.naturalWidth > 0),
          ),
      'generated image rendered',
    );
    assert.equal(requests.at(-1).auth, 'Bearer fixture-api-key');
    assert.equal(requests.at(-1).input.prompt, 'always\nfixture landscape');
    assert.equal(requests.at(-1).url, '/v1/images/generations');
    await page.locator('.image-ai-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, 'image-ai-preview.png') });
    check('settings preview generates, downloads and displays a valid image');
    await page.evaluate(() =>
      window.dock.setAppletApiPermissions({ read: true, execute: true, useImageAi: false }),
    );
    await page.evaluate(() => window.dock.executeCommand('fixture.image-ai.generate'));
    await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      return s.logs.some(
        (l) =>
          l.source === 'fixture.image-ai' &&
          l.message.includes('image-api-probe:') &&
          l.message.includes('API_DISABLED'),
      );
    }, 'denied image permission');
    await page.evaluate(() =>
      window.dock.setAppletApiPermissions({ read: true, execute: true, useImageAi: true }),
    );
    await page.evaluate(() => window.dock.executeCommand('fixture.image-ai.generate'));
    await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      return s.logs.some(
        (l) =>
          l.source === 'fixture.image-ai' &&
          l.message.includes('image-api-probe:') &&
          l.message.includes('"ok":true'),
      );
    }, 'Node image API round trip');
    check('Node Applet permission and generation/result round trip');
    await page.evaluate(() => window.dock.executeCommand('fixture.image-ai-dotnet.generate'));
    const nativeResult = await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      const log = s.logs.find(
        (l) => l.source === 'fixture.image-ai-dotnet' && l.message.startsWith('image-api-probe:'),
      );
      return log && JSON.parse(log.message.slice('image-api-probe:'.length));
    }, '.NET image API round trip');
    assert.equal(nativeResult.ok, true);
    assert.equal(nativeResult.bytes, png.length);
    check('.NET Applet generation and chunked result round trip');
    await host.resize(760, 700);
    await page.getByRole('button', { name: 'Preview presetの設定', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: '生成設定', exact: true }).click();
    await page.screenshot({ path: path.join(profile, 'image-ai-dialog.png') });
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    check('narrow dialog keeps tabs and dismissal reachable');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          checks,
          exeHash: host.hash,
          requests: requests.map((r) => ({ url: r.url, model: r.input.model, count: r.input.n })),
        },
        null,
        2,
      ),
    );
    console.log(profile);
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    if (host)
      await host.main.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (host) await host.close();
    if (server) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
