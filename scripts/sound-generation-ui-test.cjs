const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const { newTtsServer } = require('../out/main/shared/tts');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/sound-generation-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
const directory = path.join(profile, 'data/assets/sounds');
fs.mkdirSync(path.join(directory, '通知'), { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, { closeToTray: false, soundEnabled: true });
settings.globalShortcutCommands = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.updates.checkHostOnStartup =
  settings.updates.checkAppletsOnStartup =
  settings.updates.checkHostOnAboutOpen =
    false;
settings.soundLibrary = { groups: [{ id: 'notice', name: '通知', files: [] }] };
const requests = [],
  checks = [],
  errors = [];
let mode = 'success',
  app,
  host;
const bytes = wave(2200);
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  requests.push({ path: req.url, body: JSON.parse(raw), mode });
  if (mode === 'wait') return;
  res.writeHead(200, { 'Content-Type': 'audio/wav' });
  res.end(mode === 'invalid' ? Buffer.from('invalid') : bytes);
});
const model = () => host.evaluate(() => window.__soundGenerationModel);
const dialog = () => host.locator('dialog.sound-generation-dialog');
async function open() {
  await host.evaluate(() => window.dock.executeCommand('appdock.sound-library.open'));
  await until(
    async () => (await host.evaluate(() => window.dock.pages.get()))?.kind === 'sound-library',
    'sound library',
  );
  const buttons = host.getByRole('button', { name: '音声を生成…', exact: true });
  await buttons.click();
  await dialog().waitFor();
  await until(async () => !!(await model()), 'generation model');
}
async function generate(count, text = '処理が完了しました。') {
  await dialog().getByRole('textbox', { name: '読み上げる文章', exact: true }).fill(text);
  await dialog().getByRole('button', { name: '生成して保存', exact: true }).click();
  await until(async () => {
    const m = await model();
    return m?.phase === 'idle' && m.items.length === count && m.items[0].state === 'saved';
  }, 'saved WAV');
  return (await model()).items[0];
}
async function closeDialog() {
  await dialog().getByRole('button', { name: '閉じる', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
}
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    settings.tts = {
      connections: ['default', 'alternate'].map((id) => ({
        ...newTtsServer(id),
        name: id === 'default' ? '既定の声' : '比較用の声',
        baseUrl,
        model: id,
        defaultVoice: id,
        defaultInstructions: 'やさしく',
        alwaysInstructions: '日本語',
        instructionsMode: 'json',
        instructionsParameter: 'instructions',
      })),
      defaultConnectionId: 'default',
    };
    fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
    const start = async () => {
      app = await launch(profile, portable);
      host = app.main;
      host.on('pageerror', (e) => errors.push(String(e)));
      await host.evaluate(() =>
        window.dock.soundGeneration.onChanged((m) => {
          window.__soundGenerationModel = m;
        }),
      );
    };
    await start();
    await app.resize(1720, 1000);
    await host.evaluate(() => window.dock.executeCommand('appdock.sound-library.open'));
    await until(
      async () => !!(await host.evaluate(() => window.dock.pages.get())),
      'library ready',
    );
    const adjacent = await host
      .locator('header')
      .getByRole('button', { name: '音を追加', exact: true })
      .evaluate((el) => el.nextElementSibling?.textContent?.trim());
    assert.equal(adjacent, '音声を生成…');
    await host.evaluate(async () => {
      const page = await window.dock.pages.get();
      await window.dock.pages.act({
        id: page.id,
        type: 'gallery',
        command: 'folder',
        folder: '通知',
      });
      const updated = await window.dock.pages.get();
      const group = updated.content.groups.find((g) => g.title === '通知');
      await window.dock.pages.act({
        id: page.id,
        type: 'gallery',
        command: 'group',
        groupId: group.id,
      });
    });
    await open();
    assert.equal(
      await dialog().getByRole('combobox', { name: '保存先フォルダー' }).inputValue(),
      '通知',
    );
    const first = await generate(1);
    assert.deepEqual(fs.readFileSync(path.join(directory, first.file)), bytes);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.instructions, '日本語\nやさしく');
    await dialog().getByRole('combobox', { name: '音声サーバー' }).selectOption('alternate');
    await dialog().getByRole('checkbox', { name: 'サーバーの設定を使う' }).uncheck();
    await dialog().getByRole('textbox', { name: 'ニュアンス', exact: true }).fill('明るく');
    const second = await generate(2);
    assert.notEqual(first.file, second.file);
    assert.equal(requests[1].body.model, 'alternate');
    assert.equal(requests[1].body.instructions, '日本語\n明るく');
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile))).tts
        .defaultConnectionId,
      'default',
    );
    checks.push(
      'adjacent entry, inherited folder/group, two distinct WAVs, server/nuance overrides without settings changes',
    );
    let row = dialog().locator(`[data-generated-sound="${second.id}"]`);
    await row.getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => !!(await model()).playback, 'preview accepted');
    await row.getByRole('button', { name: '停止', exact: true }).click();
    await until(async () => !(await model()).playback, 'preview stopped');
    await row.getByRole('button', { name: '名前変更', exact: true }).click();
    const rename = host.getByRole('dialog', { name: '名前変更', exact: true });
    await rename.getByRole('textbox', { name: '新しい名前（.wav）' }).fill('完了のお知らせ');
    await rename.getByRole('button', { name: '適用', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    await until(
      () => fs.existsSync(path.join(directory, '通知/完了のお知らせ.wav')),
      'renamed asset',
    );
    assert.deepEqual(fs.readFileSync(path.join(directory, '通知/完了のお知らせ.wav')), bytes);
    await dialog()
      .locator(`[data-generated-sound="${first.id}"]`)
      .getByRole('button', { name: '削除', exact: true })
      .click();
    const deletion = host.getByRole('dialog', { name: '削除', exact: true });
    await deletion.getByRole('button', { name: 'ごみ箱へ移動', exact: true }).click();
    await deletion.waitFor({ state: 'hidden' });
    await until(() => !fs.existsSync(path.join(directory, first.file)), 'recycled asset');
    assert.equal((await model()).items.length, 1);
    checks.push(
      'shared playback stop, rename preserves WAV, confirmed recycle removes asset and membership',
    );
    for (const [width, height, theme] of [
      [1720, 1000, 'light'],
      [900, 620, 'dark'],
    ]) {
      await app.resize(width, height);
      await app.save({ host: { theme } });
      await dialog().getByRole('button', { name: '閉じる', exact: true }).scrollIntoViewIfNeeded();
      const bounds = await dialog().boundingBox();
      assert(bounds.width <= width && bounds.height <= height);
      const overflow = await dialog().evaluate((el) => el.scrollWidth > el.clientWidth + 2);
      assert(!overflow);
      await host.screenshot({ path: path.join(profile, `dialog-${theme}.png`) });
    }
    checks.push(
      'wide/light and minimum-window/dark layouts, visible footer and no horizontal overflow',
    );
    mode = 'wait';
    await row.getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => !!(await model()).playback, 'preview before generation');
    await dialog().getByRole('button', { name: '生成して保存', exact: true }).click();
    await until(() => requests.length === 3, 'pending request');
    await row.getByRole('button', { name: '停止', exact: true }).click();
    await until(async () => !(await model()).playback, 'preview stopped during generation');
    assert.equal((await model()).phase, 'generating');
    await dialog().getByRole('button', { name: '生成を中止', exact: true }).click();
    await until(async () => (await model()).phase === 'idle', 'cancelled');
    assert.equal((await model()).items.length, 1);
    assert.equal((await model()).error, '');
    mode = 'invalid';
    await dialog().getByRole('button', { name: '生成して保存', exact: true }).click();
    await until(async () => !!(await model()).error, 'invalid WAV failure');
    assert.equal((await model()).items.length, 1);
    mode = 'success';
    await generate(2, '次の音声です。');
    checks.push('cancel/invalid WAV preserve prior assets and allow subsequent generation');
    await closeDialog();
    assert.equal(
      fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length,
      2,
    );
    await until(
      () =>
        host
          .getByRole('button', { name: '音声を生成…', exact: true })
          .evaluate((el) => el === document.activeElement),
      'opener focus restored',
    );
    await app.close();
    app = null;
    await start();
    await open();
    assert.equal((await model()).items.length, 0);
    assert.equal(
      fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length,
      2,
    );
    await closeDialog();
    checks.push(
      'close restores opener, persisted sounds survive restart, new dialog starts with an empty session',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, portable, sha256: app.hash, checks, requests, errors }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, errors, error: String(error.stack || error) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})();
