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
  errors = [],
  layouts = [],
  held = [];
let mode = 'success',
  app,
  host;
const bytes = wave(2200);
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  requests.push({ path: req.url, body: JSON.parse(raw), mode });
  if (mode === 'wait') {
    held.push(res);
    return;
  }
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
  const item = await submit(text);
  await until(async () => {
    const m = await model();
    return (
      m.items.length === count &&
      m.items.find((value) => value.id === item.id)?.state === 'saved' &&
      !m.items.find((value) => value.id === item.id)?.busy
    );
  }, 'saved WAV');
  return (await model()).items.find((value) => value.id === item.id);
}
async function submit(text) {
  const count = (await model()).items.length;
  await dialog().getByRole('textbox', { name: '読み上げる文章', exact: true }).fill(text);
  await dialog().getByRole('button', { name: '生成して保存', exact: true }).click();
  await until(async () => (await model()).items.length === count + 1, 'immediate card');
  return (await model()).items[0];
}
async function closeDialog() {
  await dialog().getByRole('button', { name: '閉じる', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
}
async function cardLayout(row, label) {
  const geometry = await row.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      height: box.height,
      information: el.querySelector('[role="status"]').getBoundingClientRect().top - box.top,
      actions: el.querySelector('.settings-actions').getBoundingClientRect().top - box.top,
      details: el.querySelector('summary').getBoundingClientRect().top - box.top,
    };
  });
  layouts.push({ label, ...geometry });
  return geometry;
}
function sameLayout(actual, expected) {
  for (const key of Object.keys(expected))
    assert(
      Math.abs(actual[key] - expected[key]) <= 1,
      `${key}: ${actual[key]} != ${expected[key]}`,
    );
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
    require('./test-settings.cjs').write(profile, settings);
    const start = async () => {
      app = await launch(profile, portable);
      await app.app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
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
    assert.equal(first.file, '通知/処理が完了しました。-001.wav');
    assert.deepEqual(fs.readFileSync(path.join(directory, first.file)), bytes);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.instructions, '日本語\nやさしく');
    await dialog().getByRole('combobox', { name: '音声サーバー' }).selectOption('alternate');
    await dialog().getByRole('checkbox', { name: 'サーバーの設定を使う' }).uncheck();
    await dialog().getByRole('textbox', { name: '話し方', exact: true }).fill('明るく');
    const second = await generate(2);
    assert.equal(second.file, '通知/処理が完了しました。-002.wav');
    assert.notEqual(first.file, second.file);
    assert.equal(requests[1].body.model, 'alternate');
    assert.equal(requests[1].body.instructions, '日本語\n明るく');
    assert.equal(require('./test-settings.cjs').read(profile).tts.defaultConnectionId, 'default');
    checks.push(
      'adjacent entry, inherited folder/group, two distinct WAVs, server/nuance overrides without settings changes',
    );
    let row = dialog().locator(`[data-generated-sound="${second.id}"]`);
    assert.match(await row.getByRole('status').first().innerText(), /^通知 · WAV · /);
    const savedLayout = await cardLayout(row, 'saved');
    await row.getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => !!(await model()).playback, 'preview accepted');
    await row.getByRole('button', { name: '停止', exact: true }).waitFor();
    sameLayout(await cardLayout(row, 'preview'), savedLayout);
    await row.getByRole('button', { name: '停止', exact: true }).click();
    await until(async () => !(await model()).playback, 'preview stopped');
    sameLayout(await cardLayout(row, 'preview stopped'), savedLayout);
    await row.getByRole('button', { name: '名前変更', exact: true }).press('Enter');
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
    const deletion = host.getByRole('dialog', { name: '生成した音声を削除する', exact: true });
    await deletion.getByRole('button', { name: '削除', exact: true }).click();
    await deletion.waitFor({ state: 'hidden' });
    await until(() => !fs.existsSync(path.join(directory, first.file)), 'recycled asset');
    assert.equal((await model()).items.length, 2);
    assert.equal((await model()).items.find((item) => item.id === first.id).resultDeleted, true);
    await dialog()
      .locator(`[data-generated-sound="${first.id}"]`)
      .getByRole('button', { name: 'ジョブを削除', exact: true })
      .click();
    await until(async () => (await model()).items.length === 1, 'only X removes the job');
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
      const textInput = dialog().getByRole('textbox', { name: '読み上げる文章', exact: true });
      await textInput.scrollIntoViewIfNeeded();
      await textInput.focus();
      await host.screenshot({ path: path.join(profile, `input-focus-${theme}.png`) });
      const renameButton = row.getByRole('button', { name: '名前変更', exact: true });
      await renameButton.scrollIntoViewIfNeeded();
      const playButton = row.getByRole('button', { name: '試聴', exact: true });
      await playButton.focus();
      await playButton.press('Tab');
      assert(await renameButton.evaluate((el) => el === document.activeElement));
      await host.screenshot({ path: path.join(profile, `dialog-${theme}.png`) });
    }
    checks.push(
      'wide/light and minimum-window/dark layouts, input and icon keyboard focus, visible footer and no horizontal overflow',
    );
    await app.resize(1720, 1000);
    await app.save({ host: { theme: 'light' } });
    const state = async (id) => (await model()).items.find((value) => value.id === id);
    const card = (id) => dialog().locator(`[data-generated-sound="${id}"]`);
    mode = 'wait';
    const longText = '先に生成する音。長い文章でもカードの高さを揃えます。'.repeat(4);
    const generating = await submit(longText);
    await until(() => requests.length === 3, 'pending request');
    assert.equal((await state(generating.id)).state, 'generating');
    const queued = await submit('次に生成する音');
    const canceled = await submit('中止する音');
    assert.equal((await state(queued.id)).state, 'queued');
    assert.equal(requests.length, 3);
    const pendingLayouts = new Map();
    for (const [width, height] of [
      [1720, 1000],
      [900, 620],
    ]) {
      await app.resize(width, height);
      const activeLayout = await cardLayout(card(generating.id), `generating ${width}`);
      const waitingLayout = await cardLayout(card(queued.id), `queued ${width}`);
      sameLayout(activeLayout, waitingLayout);
      pendingLayouts.set(width, activeLayout);
    }
    await app.resize(1720, 1000);
    assert.equal(
      await dialog().getByRole('textbox', { name: '読み上げる文章', exact: true }).isEnabled(),
      true,
    );
    await row.getByRole('button', { name: '試聴', exact: true }).click();
    await until(async () => !!(await model()).playback, 'preview during generation');
    await row.getByRole('button', { name: '停止', exact: true }).click();
    await until(async () => !(await model()).playback, 'preview stopped during generation');
    await row.getByRole('button', { name: '名前変更', exact: true }).click();
    await rename.getByRole('textbox', { name: '新しい名前（.wav）' }).fill('生成中に変更');
    await rename.getByRole('button', { name: '適用', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    assert(fs.existsSync(path.join(directory, '通知/生成中に変更.wav')));
    await card(canceled.id).getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(
      async () => (await state(canceled.id)).state === 'canceled',
      'queued card canceled',
    );
    sameLayout(await cardLayout(card(canceled.id), 'canceled'), pendingLayouts.get(1720));
    await host.screenshot({ path: path.join(profile, 'queued-cards.png') });
    mode = 'success';
    held[0].writeHead(200, { 'Content-Type': 'audio/wav' });
    held[0].end(bytes);
    await until(
      async () =>
        (await state(queued.id)).state === 'saved' &&
        !(await state(queued.id)).busy &&
        (await state(generating.id)).state === 'saved',
      'FIFO saved',
    );
    assert.deepEqual(
      requests.slice(2).map((value) => value.body.input),
      [longText, '次に生成する音'],
    );
    for (const [width, height] of [
      [1720, 1000],
      [900, 620],
    ]) {
      await app.resize(width, height);
      sameLayout(
        await cardLayout(card(generating.id), `completed ${width}`),
        pendingLayouts.get(width),
      );
      sameLayout(
        await cardLayout(card(queued.id), `queued then completed ${width}`),
        pendingLayouts.get(width),
      );
    }
    await app.resize(1720, 1000);
    const detail = card(generating.id).locator('details');
    await detail.locator('summary').click();
    assert(
      (await cardLayout(card(generating.id), 'details expanded')).height >
        pendingLayouts.get(1720).height,
    );
    assert.equal(
      await detail.locator('dd').nth(0).innerText(),
      path.basename((await state(generating.id)).file),
    );
    assert.equal(await detail.locator('dd').nth(1).innerText(), '通知');
    assert.equal(await detail.locator('dd').nth(2).innerText(), longText);
    await detail.locator('summary').click();
    sameLayout(
      await cardLayout(card(generating.id), 'details collapsed'),
      pendingLayouts.get(1720),
    );
    checks.push(
      'immediate cards, sequential shared queue, per-card cancellation, editable form, preview and rename while generating',
    );
    mode = 'wait';
    const interrupted = await submit('生成を中止する音');
    await until(async () => (await state(interrupted.id)).state === 'generating', 'active card');
    await card(interrupted.id).getByRole('button', { name: '生成を中止', exact: true }).click();
    await until(
      async () =>
        (await state(interrupted.id)).state === 'canceled' && !(await state(interrupted.id)).busy,
      'active card canceled',
    );
    mode = 'invalid';
    const failed = await submit('再生成する音');
    await until(
      async () => (await state(failed.id)).state === 'failed' && !(await state(failed.id)).busy,
      'invalid WAV card failure',
    );
    const failedLayout = await cardLayout(card(failed.id), 'failed');
    sameLayout(failedLayout, pendingLayouts.get(1720));
    mode = 'success';
    await card(failed.id).getByRole('button', { name: '再生成', exact: true }).click();
    await until(async () => (await model()).items[0].id !== failed.id, 'new regeneration card');
    const regeneratedId = (await model()).items[0].id;
    await until(
      async () =>
        (await state(regeneratedId)).state === 'saved' && !(await state(regeneratedId)).busy,
      'new card regenerated',
    );
    sameLayout(await cardLayout(card(regeneratedId), 'regenerated'), failedLayout);
    checks.push(
      'stable collapsed height and row positions across queue, generation, completion, cancellation, failure and preview; explicit details show full values',
    );
    await card(interrupted.id).getByRole('button', { name: 'ジョブを削除', exact: true }).click();
    await until(async () => !(await state(interrupted.id)), 'canceled card removed');
    checks.push(
      'text-derived serial filenames, active cancellation, card-local failure and explicit regeneration as a new job',
    );
    await closeDialog();
    assert.equal(
      fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length,
      4,
    );
    await until(
      () =>
        host
          .getByRole('button', { name: '音声を生成…', exact: true })
          .evaluate((el) => el === document.activeElement),
      'opener focus restored',
    );
    await open();
    mode = 'wait';
    const heldBefore = held.length;
    const backgroundOne = await submit('閉じても継続');
    const backgroundTwo = await submit('待機も継続');
    await until(() => held.length > heldBefore, 'background request');
    await dialog().getByRole('button', { name: '閉じる', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    mode = 'success';
    held[heldBefore].writeHead(200, { 'Content-Type': 'audio/wav' });
    held[heldBefore].end(bytes);
    await until(
      () =>
        fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length === 6,
      'background WAVs saved away from the library',
    );
    await open();
    await until(async () => {
      const items = (await model()).items;
      return [backgroundOne.id, backgroundTwo.id].every(
        (id) => items.find((item) => item.id === id)?.state === 'saved',
      );
    }, 'background jobs restored');
    await closeDialog();
    assert.equal(
      fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length,
      6,
    );
    checks.push(
      'dialog closure and navigation preserve queued and active cards until saving completes',
    );
    await app.close();
    app = null;
    await start();
    await open();
    assert((await model()).items.some((item) => item.id === backgroundOne.id));
    assert((await model()).items.some((item) => item.id === backgroundTwo.id));
    assert.equal(
      fs.readdirSync(path.join(directory, '通知')).filter((x) => x.endsWith('.wav')).length,
      6,
    );
    await closeDialog();
    checks.push('close restores opener and persistent jobs and saved sounds survive restart');
    assert.deepEqual(errors, []);
    await open();
    const savedJob = (await model()).items.find((item) => item.id === backgroundOne.id);
    const savedFile = path.join(directory, savedJob.file);
    const savedBytes = fs.readFileSync(savedFile);
    await dialog()
      .locator(`[data-generated-sound="${savedJob.id}"]`)
      .getByRole('button', { name: 'ジョブを削除', exact: true })
      .click();
    await until(
      async () => !(await model()).items.some((item) => item.id === savedJob.id),
      'sound X removes the saved job',
    );
    assert.deepEqual(fs.readFileSync(savedFile), savedBytes);
    const remaining = (await model()).items.length;
    await closeDialog();
    const status = await require('./shell-bars-helper.cjs').barPage(host, 'statusbar');
    await until(async () => {
      const c = await status.evaluate(
        async () => (await window.appdockBar.connect()).snapshot.jobs,
      );
      return c.active + c.ended + c.attention === remaining;
    }, 'sound jobs update shared status bar');
    await status.screenshot({ path: path.join(profile, 'job-statusbar.png') });
    await app.close();
    app = null;
    await start();
    await open();
    assert(!(await model()).items.some((item) => item.id === savedJob.id || item.id === first.id));
    assert.deepEqual(fs.readFileSync(savedFile), savedBytes);
    await closeDialog();
    checks.push(
      'sound X removes only the job, shared counts update, and dismissed jobs do not return after restart',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, portable, sha256: app.hash, checks, requests, errors, layouts },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: false, checks, errors, layouts, error: String(error.stack || error) },
        null,
        2,
      ),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})();
