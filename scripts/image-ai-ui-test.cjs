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
const privateMethods = ['ai.image.generate', 'ai.image.results.read'];
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
        commands: [{ id: id + '.probe', title: 'Image API probe' }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'index.cjs'),
      `exports.activate = async c => c.commands.register('${id}.probe', 'Image API probe', async () => {
        const rejected = [];
        for (const method of ${JSON.stringify(privateMethods)}) {
          let code = 'ALLOWED';
          try { await c.appdock.call(method, {}); } catch (error) { code = error.code; }
          rejected.push({method, code});
        }
        const list = await c.appdock.call('ai.image.connections.list', {});
        const jobs = [];
        for (const method of ['ai.image.jobs.get', 'ai.image.jobs.cancel']) {
          let code = 'ALLOWED';
          try { await c.appdock.call(method, {jobId: 'missing'}); } catch (error) { code = error.code; }
          jobs.push({method, code});
        }
        await c.log.info('image-api-probe:' + JSON.stringify({rejected, connections: list.connections.length, jobs}));
      });`,
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
        minimumHostVersion: '0.166.0',
        runtime: 'dotnet',
        entry: 'AppDock.Extensions.ImageAiProbe.dll',
        type: 'AppDock.Extensions.ImageAiProbe.ImageAiProbe',
        capabilities: ['appdock-api'],
        commands: [{ id: nativeId + '.probe', title: 'Image API probe' }],
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
    require('./test-settings.cjs').write(profile, settings);
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
    await page.getByRole('button', { name: '画像生成サーバーを追加', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('登録名', { exact: true }).fill('Discard preset');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.imageAi.connections.length,
      1,
    );
    check('cancel leaves registrations and credentials untouched');
    await page.getByRole('button', { name: '画像生成サーバーを追加', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('登録名', { exact: true }).fill('Preview preset');
    await dialog.getByLabel('APIのURL', { exact: true }).fill(url);
    await dialog.getByLabel('認証方式', { exact: true }).selectOption('none');
    assert.equal(await dialog.getByLabel('APIキー', { exact: true }).count(), 0);
    await dialog.getByLabel('認証方式', { exact: true }).selectOption('bearer');
    await dialog.getByLabel('APIキー', { exact: true }).fill('fixture-api-key');
    await dialog.getByLabel('認証方式', { exact: true }).selectOption('none');
    await dialog.getByLabel('認証方式', { exact: true }).selectOption('bearer');
    assert.equal(
      await dialog.getByLabel('APIキー', { exact: true }).inputValue(),
      'fixture-api-key',
    );
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
    await page.getByLabel('試験するサーバー', { exact: true }).selectOption(saved.id);
    for (const label of ['試験の追加プロンプト', '試験の入力データ']) {
      const input = page.getByLabel(label, { exact: true });
      assert.equal(await input.inputValue(), '');
      assert((await input.getAttribute('placeholder')).length > 10);
    }
    await page.getByLabel('試験の追加プロンプト', { exact: true }).fill('watercolor');
    await page.getByLabel('試験の入力データ', { exact: true }).fill('fixture landscape');
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
    assert.equal(requests.at(-1).input.prompt, 'always\nwatercolor\nfixture landscape');
    assert.equal(requests.at(-1).url, '/v1/images/generations');
    await page.locator('.image-ai-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, 'image-ai-preview.png') });
    check('settings preview generates, downloads and displays a valid image');
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.permissions.open'));
    await settingsPage(page);
    const permission = page.getByTestId('permission-row-useImageAi');
    const toggle = permission.getByRole('switch', { name: 'Applet：画像生成AI', exact: true });
    for (const value of [false, true]) {
      if ((await toggle.getAttribute('aria-checked')) !== String(value)) await toggle.click();
      await until(
        async () =>
          (await page.evaluate(() => window.dock.snapshot())).appletApi.permissions.useImageAi ===
            value && (await toggle.getAttribute('aria-checked')) === String(value),
        'image permission saved',
      );
    }
    assert.equal(await permission.locator('[data-caller="MCP"]').innerText(), '未対応');
    await page.screenshot({ path: path.join(profile, 'image-ai-permission.png') });
    check('image generation permission remains visible and can persist OFF and ON');
    const before = requests.length;
    for (const appletId of [id, nativeId]) {
      await page.evaluate((id) => window.dock.executeCommand(id + '.probe'), appletId);
      const result = await until(async () => {
        const s = await page.evaluate(() => window.dock.snapshot());
        const log = s.logs.find(
          (l) => l.source === appletId && l.message.startsWith('image-api-probe:'),
        );
        return log && JSON.parse(log.message.slice('image-api-probe:'.length));
      }, appletId + ' private API rejection');
      assert.deepEqual(
        result.rejected,
        privateMethods.map((method) => ({ method, code: 'INVALID_ARGUMENT' })),
      );
      assert.equal(result.connections, 2);
      assert.deepEqual(
        result.jobs,
        ['ai.image.jobs.get', 'ai.image.jobs.cancel'].map((method) => ({
          method,
          code: 'NOT_FOUND',
        })),
      );
      check(
        appletId +
          ' retains connection/job operations and rejects generation and result reads with permission ON',
      );
    }
    assert.equal(requests.length, before);
    check('rejected Applet calls do not contact the image server');
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.image-ai.open'));
    await settingsPage(page);
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
