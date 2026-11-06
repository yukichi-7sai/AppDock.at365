const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { freePort } = require('./electron-main-helper.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'image-generation-ui-' + Date.now());
const directory = path.join(profile, 'data/assets/images');
fs.mkdirSync(path.join(directory, 'pictures'), { recursive: true });
const png = require('../tests/fixtures/image-ai-png.cjs');
const requests = [],
  checks = [],
  errors = [],
  clients = [];
let app, page, server, held;
const model = () => page.evaluate(() => window.__imageGenerationModel);
const dialog = () => page.locator('dialog.image-generation-dialog');
const check = (text) => {
  checks.push(text);
  console.log('PASS ' + text);
};
const invoke = (action) => page.evaluate((action) => window.dock.automation(action), action);
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      let raw = '';
      for await (const part of req) raw += part;
      const input = JSON.parse(raw);
      requests.push(input);
      if (input.prompt.includes('hold')) {
        held = res;
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: Array.from({ length: input.n }, () => ({ b64_json: png.toString('base64') })),
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.globalShortcutCommands = [];
    settings.gestures.enabled = settings.touchpadGestures.enabled = false;
    settings.updates.checkHostOnStartup =
      settings.updates.checkAppletsOnStartup =
      settings.updates.checkHostOnAboutOpen =
        false;
    settings.imageLibrary = { groups: [{ id: 'favorites', name: 'Favorites', images: [] }] };
    settings.imageAi = {
      connections: [
        {
          ...newImageAiConnection('fixture'),
          name: 'Image fixture',
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          authentication: 'none',
          defaultModel: 'fixture-model',
          alwaysPrompt: 'always',
          defaultPrompt: 'default',
          mcpEnabled: true,
        },
      ],
      defaultConnectionId: 'fixture',
    };
    settings.operationPermissions = {
      applet: { read: true, write: true, execute: true, useImageAi: true },
      mcp: { allowWrite: true, allowExecute: true, allowUseImageAi: true },
    };
    for (const runtime of ['node', 'dotnet']) {
      const id = 'fixture.image-registration-' + runtime,
        dir = path.join(profile, 'extensions', id);
      fs.mkdirSync(dir, { recursive: true });
      const manifest = {
        apiVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        minimumHostVersion: '0.175.0',
        runtime,
        capabilities: ['appdock-api'],
        commands: [{ id: id + '.register', title: 'Image registration probe' }],
      };
      if (runtime === 'node') {
        manifest.entry = 'index.cjs';
        fs.writeFileSync(
          path.join(dir, 'index.cjs'),
          `exports.activate = async c => c.commands.register('${id}.register', 'Image registration probe', async () => {
          const input = {requestId:'node-image-registration', input:'node fixture', destination:{folder:'pictures',name:'node'}};
          const accepted = await c.appdock.call('ai.image.generateAndRegister', input);
          const repeated = await c.appdock.call('ai.image.generateAndRegister', input);
          if (accepted.jobId !== repeated.jobId) throw Error('duplicate request');
          for (let attempt=0;attempt<200;attempt++) {
            const job = await c.appdock.call('ai.image.jobs.get',{jobId:accepted.jobId});
            if (job.state === 'completed') { await c.log.info('image-registration-node:'+JSON.stringify(job)); return; }
            await new Promise(r=>setTimeout(r,50));
          }
          throw Error('Image registration timed out');
        });`,
        );
      } else {
        manifest.entry = 'AppDock.Extensions.ImageAiProbe.dll';
        manifest.type = 'AppDock.Extensions.ImageAiProbe.ImageAiProbe';
        require('./copy-host.cjs').copyHost(
          path.join(
            root,
            'tests/fixtures/dotnet/AppDock.Extensions.ImageAiProbe/bin/Release/net10.0/AppDock.Extensions.ImageAiProbe.dll',
          ),
          path.join(dir, manifest.entry),
        );
      }
      fs.writeFileSync(path.join(dir, 'extension.json'), JSON.stringify(manifest));
      settings.extensions[id] = { enabled: true, settings: {} };
    }
    require('./test-settings.cjs').write(profile, settings);
    app = await launch(profile, process.argv[2]);
    page = app.main;
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.evaluate(() =>
      window.dock.imageGeneration.onChanged((value) => {
        window.__imageGenerationModel = value;
      }),
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    await until(
      async () => (await page.evaluate(() => window.dock.pages.get()))?.kind === 'image-library',
      'image library',
    );
    await page.evaluate(async () => {
      const p = await window.dock.pages.get();
      await window.dock.pages.act({
        id: p.id,
        type: 'gallery',
        command: 'folder',
        folder: 'pictures',
      });
      const updated = await window.dock.pages.get();
      await window.dock.pages.act({
        id: p.id,
        type: 'gallery',
        command: 'group',
        groupId: updated.content.groups.find((g) => g.title === 'Favorites').id,
      });
    });
    await page.getByRole('button', { name: '画像を生成', exact: true }).click();
    await dialog().waitFor();
    assert.equal(
      await dialog().getByLabel('保存先フォルダー', { exact: true }).inputValue(),
      'pictures',
    );
    await dialog().getByLabel('生成したい画像', { exact: true }).fill('flowers');
    await dialog().getByLabel('保存名', { exact: true }).fill('flowers');
    await dialog().getByLabel('生成枚数', { exact: true }).fill('2');
    await dialog().getByRole('button', { name: '生成して追加', exact: true }).click();
    await until(
      async () => (await model())?.items[0]?.job.state === 'completed',
      'registered images',
    );
    let item = (await model()).items[0];
    assert.equal(item.entries.length, 2);
    for (const { entry } of item.entries)
      assert.deepEqual(fs.readFileSync(path.join(directory, entry.ref.file)), png);
    assert.equal(
      require('./test-settings.cjs').read(profile).imageLibrary.groups[0].images.length,
      2,
    );
    assert.equal(requests[0].prompt, 'always\ndefault\nflowers');
    await until(
      () =>
        dialog()
          .locator('.image-generation-thumbnail img')
          .evaluateAll(
            (images) =>
              images.length === 2 &&
              images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      'result thumbnails',
    );
    check('selected folder/group, two exact PNGs, preset prompt, unique names and thumbnails');
    await dialog().locator('.image-generation-thumbnail').first().click();
    await page.locator('dialog.library-preview-dialog').waitFor();
    await page
      .locator('dialog.library-preview-dialog')
      .getByText('Favorites', { exact: true })
      .waitFor();
    await page
      .locator('dialog.library-preview-dialog')
      .getByRole('button', { name: '閉じる', exact: true })
      .click();
    await dialog().getByRole('button', { name: '名前変更', exact: true }).first().click();
    let editor = page.locator('dialog.settings-modal').last();
    await editor.getByLabel('保存名', { exact: true }).fill('renamed.png');
    await editor.getByRole('button', { name: '適用', exact: true }).click();
    await until(() => fs.existsSync(path.join(directory, 'pictures/renamed.png')), 'renamed image');
    await dialog().getByRole('button', { name: '削除', exact: true }).first().click();
    editor = page.locator('dialog.settings-modal').last();
    await editor.getByRole('button', { name: 'ごみ箱へ移動', exact: true }).click();
    await until(
      () => !fs.existsSync(path.join(directory, 'pictures/renamed.png')),
      'deleted image',
    );
    await page.locator('dialog.settings-group-dialog').waitFor({ state: 'detached' });
    check('shared enlargement, rename and recycle-bin delete');
    for (const [width, height] of [
      [1720, 1000],
      [900, 620],
    ]) {
      await app.resize(width, height);
      await page.screenshot({ path: path.join(profile, `layout-${width}.png`) });
      assert(await dialog().getByRole('button', { name: '閉じる', exact: true }).isVisible());
      assert(await dialog().evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    }
    await dialog().getByLabel('生成したい画像', { exact: true }).fill('hold');
    await dialog().getByRole('button', { name: '生成して追加', exact: true }).click();
    await until(() => held, 'pending generation');
    await dialog().getByRole('button', { name: '閉じる', exact: true }).click();
    editor = page.locator('dialog.settings-modal').last();
    await editor.getByRole('button', { name: '破棄して閉じる', exact: true }).click();
    await until(async () => !(await model()), 'closed generation');
    held.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    check('responsive dialog and close cancels only its pending generation');
    for (const runtime of ['node', 'dotnet']) {
      const id = 'fixture.image-registration-' + runtime;
      await until(
        async () =>
          (await page.evaluate(() => window.dock.snapshot())).extensions.some(
            (e) => e.id === id && e.state === 'running',
          ),
        runtime + ' applet',
      );
      await page.evaluate((id) => window.dock.executeCommand(id + '.register'), id);
      const job = await until(async () => {
        const line = (await page.evaluate(() => window.dock.snapshot())).logs.find((entry) =>
          entry.message.startsWith('image-registration-' + runtime + ':'),
        );
        return line && JSON.parse(line.message.split(':').slice(1).join(':'));
      }, runtime + ' registration result');
      assert.equal(job.state, 'completed');
      assert(job.images.every((image) => image.ref && !image.data));
      for (const image of job.images)
        assert.deepEqual(fs.readFileSync(path.join(directory, image.ref.file)), png);
      check(runtime + ' generic AppDock call registers images without returning binary');
    }
    const registered = [];
    for (const receiver of ['mcp', 'codex']) {
      await invoke({ kind: 'configure', receiver, enabled: true, port: await freePort() });
      const state = await until(async () => {
        const state = (await invoke({ kind: 'status' })).state;
        const r = receiver === 'mcp' ? state : state.codex;
        return r.running && r;
      }, receiver + ' receiver');
      const localFile = fs
        .readdirSync(profile, { recursive: true })
        .find((file) => path.basename(file) === 'automation.json');
      const config = JSON.parse(fs.readFileSync(path.join(profile, localFile)));
      const sealed = receiver === 'mcp' ? config.token : config.codex.token;
      const token = await app.app.evaluate(
        ({ safeStorage }, sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
        sealed,
      );
      const client = new Client({ name: 'image-generation-fixture', version: '1' });
      clients.push(client);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(state.endpoint), {
          requestInit: { headers: { Authorization: 'Bearer ' + token } },
        }),
      );
      const call = async (name, args) => client.callTool({ name, arguments: args });
      const list = await client.listTools();
      assert(list.tools.some((tool) => tool.name === 'appdock_image_generate_and_register'));
      const args = {
        requestId: 'same-id',
        input: receiver,
        destination: { folder: 'pictures', name: receiver },
      };
      const accepted = (await call('appdock_image_generate_and_register', args)).structuredContent;
      assert.equal(accepted.completion, 'accepted');
      assert.equal(
        (await call('appdock_image_generate_and_register', args)).structuredContent.jobId,
        accepted.jobId,
      );
      const job = await until(async () => {
        const job = (await call('appdock_image_get_job', { jobId: accepted.jobId }))
          .structuredContent;
        return job?.state === 'completed' && job;
      }, receiver + ' registration');
      assert(job.images.every((image) => image.ref && !image.data));
      registered.push(job);
      if (registered.length === 2)
        assert((await call('appdock_image_get_job', { jobId: registered[0].jobId })).isError);
      check(receiver + ' MCP tool, deduplication and private job ownership');
    }
    assert.notEqual(registered[0].jobId, registered[1].jobId);
    await invoke({ kind: 'setImageAi', allowed: false });
    const denied = await clients[0].callTool({
      name: 'appdock_image_generate_and_register',
      arguments: { requestId: 'denied', input: 'denied', destination: { folder: '' } },
    });
    assert(denied.isError);
    assert(JSON.stringify(denied).includes('API_DISABLED'));
    check('revoking the image grant prevents new generation on both shared receiver paths');
    assert.deepEqual(errors, []);
  } catch (error) {
    errors.push(error.stack);
    process.exitCode = 1;
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    if (app)
      await app.close().catch((error) => {
        errors.push(error.stack);
        process.exitCode = 1;
      });
    held?.destroy();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ checks, errors, requests, hash: app?.hash }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks, errors }, null, 2));
  }
})();
