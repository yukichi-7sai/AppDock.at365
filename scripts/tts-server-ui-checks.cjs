const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

module.exports = async function ({
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
  restart,
}) {
  const keyfile = path.join(local, 'tts-keys.json');
  let defaultSelect = page.getByLabel('既定のサーバー', { exact: true });
  await defaultSelect.waitFor();
  assert.equal(await defaultSelect.inputValue(), 'default');
  const assertDefaultsInDialogOnly = async () => {
    for (const label of [
      'TTSモデル',
      '既定のボイス',
      '読み上げ速度',
      '常に付与するニュアンス',
      '既定のニュアンス',
    ])
      assert.equal(await page.getByLabel(label, { exact: true }).count(), 0, label);
  };
  await assertDefaultsInDialogOnly();
  assert.equal(requests.length, 0);
  const edit = async (name) => {
    await page.getByRole('button', { name: name + 'の設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    return dialog;
  };
  const field = async (scope, name, value) => {
    const control = scope.getByLabel(name, { exact: true });
    await control.fill(value);
    await control.press('Tab');
  };
  const save = async (dialog) => {
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await settleSettings(page);
  };
  let dialog = await edit('Primary');
  await field(dialog, '登録名', 'Canceled');
  await field(dialog, 'APIキー', 'canceled-secret');
  await field(dialog, '読み上げ速度', '2');
  const preset = dialog.getByLabel('接続プリセット', { exact: true });
  await preset.selectOption('qwen3-tts');
  await until(
    async () =>
      (await dialog.getByLabel('ニュアンスの送信先', { exact: true }).inputValue()) === 'instruct',
    'Qwen preset reflected in draft',
  );
  await preset.selectOption('mlx-audio');
  await until(
    async () =>
      (await dialog.getByLabel('ボイス一覧の取得方式', { exact: true }).inputValue()) === 'manual',
    'MLX preset reflected in draft',
  );
  assert.equal(await dialog.getByLabel('TTSモデル', { exact: true }).inputValue(), 'test');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await snapshot()).settings.value.tts.connections[0].name, 'Primary');
  assert.equal(
    (await snapshot()).settings.value.tts.connections[0].defaultSpeed,
    settings.tts.connections[0].defaultSpeed,
  );
  assert.equal(fs.existsSync(keyfile), false);
  dialog = await edit('Primary');
  await field(dialog, 'APIキー', 'fixture-secret');
  await save(dialog);
  assert(!fs.readFileSync(keyfile, 'utf8').includes('fixture-secret'));
  const firstCipher = fs.readFileSync(keyfile);
  dialog = await edit('Primary');
  await dialog.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
  await dialog.getByLabel('取得したボイス', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'main page selects only the default server; speech defaults belong to the dialog and cancel preserves settings and credentials',
  );

  await page.getByRole('button', { name: '音声サーバーを追加', exact: true }).click();
  dialog = page.getByRole('dialog');
  await field(dialog, '登録名', 'Secondary');
  await field(dialog, 'APIのURL', settings.tts.connections[0].baseUrl);
  await field(dialog, 'APIキー', 'secondary-secret');
  await field(dialog, 'TTSモデル', 'second-model');
  await field(dialog, '既定のボイス', 'second-voice');
  await field(dialog, '読み上げ速度', '1.5');
  assert.equal((await snapshot()).settings.value.tts.connections.length, 1);
  assert.deepEqual(fs.readFileSync(keyfile), firstCipher);
  await save(dialog);
  const second = (await snapshot()).settings.value.tts.connections[1];
  assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, 'default');
  await defaultSelect.selectOption(second.id);
  await settleSettings(page);
  assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, second.id);
  assert.deepEqual((await snapshot()).settings.value.tts.connections[1], second);
  await assertDefaultsInDialogOnly();
  dialog = await edit('Secondary');
  assert.equal(await dialog.getByLabel('TTSモデル', { exact: true }).inputValue(), 'second-model');
  await field(dialog, '読み上げ速度', '1.6');
  await dialog.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' }).click();
  await dialog.getByLabel('速度の適用先', { exact: true }).selectOption('server');
  assert.equal((await snapshot()).settings.value.tts.connections[1].defaultSpeed, 1.5);
  await save(dialog);
  await defaultSelect.selectOption('default');
  await settleSettings(page);
  dialog = await edit('Primary');
  assert.equal(await dialog.getByLabel('TTSモデル', { exact: true }).inputValue(), 'test');
  assert.equal(
    await dialog.getByLabel('読み上げ速度', { exact: true }).inputValue(),
    String(settings.tts.connections[0].defaultSpeed),
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await snapshot()).settings.value.tts.connections[1].defaultSpeed, 1.6);
  await page.getByLabel('試聴するサーバー', { exact: true }).selectOption(second.id);
  await page.getByLabel('試聴するテキスト', { exact: true }).fill('別サーバーの試聴');
  await page.getByRole('button', { name: '試聴する', exact: true }).click();
  await until(async () => {
    const model = await page.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    return model.content.auxiliary.tts.jobs.at(-1)?.state === 'completed';
  }, 'secondary preview');
  assert.equal(requests.at(-1).auth, 'Bearer secondary-secret');
  assert.equal(requests.at(-1).body.model, 'second-model');
  assert.equal(requests.at(-1).body.voice, 'second-voice');
  assert.equal(requests.at(-1).body.speed, 1.6);
  assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, 'default');
  checks.push(
    'two same-endpoint servers retain distinct credentials and defaults; preview does not change the default server',
  );

  dialog = await edit('Secondary');
  await dialog.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' }).click();
  await field(dialog, '手動ボイス一覧', '{}');
  await until(
    () => dialog.getByRole('button', { name: 'OK', exact: true }).isDisabled(),
    'invalid manual voices cannot be saved',
  );
  await field(dialog, '手動ボイス一覧', '[{"id":"second-voice","name":"Second"}]');
  await save(dialog);
  await page.getByRole('button', { name: 'サーバーを並べ替え', exact: true }).click();
  dialog = page.getByRole('dialog');
  const up = dialog.getByRole('button', { name: /上へ/ });
  await up.last().click();
  await save(dialog);
  assert.equal((await snapshot()).settings.value.tts.connections[0].id, second.id);
  assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, 'default');
  await defaultSelect.selectOption(second.id);
  await settleSettings(page);
  await page.getByRole('button', { name: 'Secondaryを削除', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('削除後の既定のサーバー', { exact: true }).selectOption('default');
  await dialog.getByRole('button', { name: '削除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await snapshot()).settings.value.tts.defaultConnectionId, 'default');
  assert.equal((await snapshot()).settings.value.tts.connections.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(keyfile)).entries[second.id], undefined);
  assert.deepEqual(fs.readFileSync(keyfile), firstCipher);
  checks.push(
    'manual voice validation, server order and deletion with replacement preserve unaffected records and keys',
  );

  for (const [theme, width, height] of [
    ['light', 1720, 1000],
    ['dark', 900, 620],
  ]) {
    await inspect(
      inspector,
      `(() => { const { BrowserWindow } = ${electronExpression}; const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/index.html')); w.setSize(${width}, ${height}); })()`,
    );
    await page.getByRole('button', { name: '表示', exact: true }).click();
    await page.getByLabel('テーマ', { exact: true }).selectOption(theme);
    await settleSettings(page);
    await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
    await defaultSelect.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, theme + '-defaults.png') });
    dialog = await edit('Primary');
    await dialog.getByLabel('TTSモデル', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, theme + '-dialog.png') });
    await field(dialog, '登録名', 'Primary');
    await save(dialog);
  }
  checks.push('light 1720x1000 and dark 900x620 keep default controls and dialog footer reachable');
  const alwaysInstructions = '自然な日本語で\n聞き取りやすく';
  await configure({
    instructionsMode: 'json',
    instructionsParameter: 'generation.instruct',
    alwaysInstructions,
    defaultInstructions: 'やさしく、落ち着いて',
    extraBody: { language: 'Japanese', generation: { temperature: 0.4 } },
    speedMode: 'playback',
    defaultSpeed: 1.4,
    voicesSource: 'manual',
    manualVoices: [{ id: 'voice-a', name: 'Voice A' }],
  });
  dialog = await edit('Primary');
  await until(
    async () =>
      (await dialog.getByLabel('常に付与するニュアンス', { exact: true }).inputValue()) ===
      alwaysInstructions,
    'settings reflected before restart',
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  const persisted = (await snapshot()).settings.value.tts;
  page = await restart();
  defaultSelect = page.getByLabel('既定のサーバー', { exact: true });
  assert.deepEqual((await snapshot()).settings.value.tts, persisted);
  assert.deepEqual(fs.readFileSync(keyfile), firstCipher);
  assert.equal(await defaultSelect.inputValue(), 'default');
  await assertDefaultsInDialogOnly();
  dialog = await edit('Primary');
  assert.equal(
    await dialog.getByLabel('常に付与するニュアンス', { exact: true }).inputValue(),
    alwaysInstructions,
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'server records, default selection, speech defaults and encrypted credentials survive a real process restart',
  );
  await page.getByLabel('試聴するテキスト', { exact: true }).fill('設定画面の音声テスト。');
  await page.getByRole('button', { name: '試聴する', exact: true }).click();
  await until(
    () =>
      requests.at(-1)?.body.generation?.instruct === alwaysInstructions + '\nやさしく、落ち着いて',
    'primary preview',
  );
  assert.equal(requests.at(-1).auth, 'Bearer fixture-secret');
  dialog = await edit('Primary');
  await dialog.getByRole('button', { name: 'APIキーを削除', exact: true }).click();
  assert.deepEqual(fs.readFileSync(keyfile), firstCipher);
  await save(dialog);
  assert.deepEqual(JSON.parse(fs.readFileSync(keyfile)).entries, {});
  return {
    alwaysInstructions,
    keyfile,
    setAlwaysInstructions: async (value) => {
      const editDialog = await edit('Primary');
      await field(editDialog, '常に付与するニュアンス', value);
      await save(editDialog);
    },
    setNuanceMode: async (mode) => {
      const editDialog = await edit('Primary');
      await editDialog.locator('summary').filter({ hasText: 'サーバーに合わせた詳細設定' }).click();
      await editDialog.getByLabel('ニュアンスの送信方式', { exact: true }).selectOption(mode);
      await save(editDialog);
    },
  };
};
