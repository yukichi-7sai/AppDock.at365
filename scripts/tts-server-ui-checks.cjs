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
      'モデル',
      '声',
      '読み上げ速度',
      'いつも加える話し方',
      '指定がないときの話し方',
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
    const speech = ['モデル', '声', '読み上げ速度', 'いつも加える話し方', '指定がないときの話し方'];
    const connection = ['登録名', 'サーバーURL', 'APIキー'];
    await scope
      .getByRole('tab', {
        name: speech.includes(name)
          ? '声・話し方'
          : connection.includes(name)
            ? '接続'
            : '詳細設定',
        exact: true,
      })
      .click();
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
  await field(dialog, '読み上げ速度', '9');
  await dialog.getByRole('tab', { name: '接続', exact: true }).click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(
    () =>
      dialog
        .getByRole('tab', { name: '声・話し方', exact: true })
        .getAttribute('aria-selected')
        .then((v) => v === 'true'),
    'invalid speed returns to its tab',
  );
  assert.equal((await snapshot()).settings.value.tts.connections[0].name, 'Primary');
  await field(dialog, '読み上げ速度', '2');
  await dialog.getByRole('tab', { name: '接続', exact: true }).click();
  const preset = dialog.getByLabel('サーバーの種類', { exact: true });
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
  assert.equal(await dialog.getByLabel('モデル', { exact: true }).inputValue(), 'test');
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
  await dialog.getByRole('tab', { name: '声・話し方', exact: true }).click();
  await dialog.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
  await dialog
    .getByRole('button', { name: '声の候補を表示', exact: true })
    .waitFor({ state: 'visible' });
  await until(
    () => dialog.getByRole('button', { name: '声の候補を表示', exact: true }).isEnabled(),
    'voice candidates loaded',
  );
  await dialog.getByRole('combobox', { name: '声', exact: true }).click();
  await dialog.getByRole('option', { name: 'voice-a Voice A', exact: true }).click();
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'main page selects only the default server; speech defaults belong to the dialog and cancel preserves settings and credentials',
  );

  await page.getByRole('button', { name: '音声サーバーを追加', exact: true }).click();
  dialog = page.getByRole('dialog');
  await field(dialog, '登録名', 'Secondary');
  await field(dialog, 'サーバーURL', settings.tts.connections[0].baseUrl);
  await field(dialog, 'APIキー', 'secondary-secret');
  await field(dialog, 'モデル', 'second-model');
  await field(dialog, '声', 'second-voice');
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
  assert.equal(await dialog.getByLabel('モデル', { exact: true }).inputValue(), 'second-model');
  await field(dialog, '読み上げ速度', '1.6');
  await dialog.getByRole('tab', { name: '詳細設定', exact: true }).click();
  await dialog.getByLabel('速度の適用先', { exact: true }).selectOption('server');
  assert.equal((await snapshot()).settings.value.tts.connections[1].defaultSpeed, 1.5);
  await save(dialog);
  await defaultSelect.selectOption('default');
  await settleSettings(page);
  dialog = await edit('Primary');
  assert.equal(await dialog.getByLabel('モデル', { exact: true }).inputValue(), 'test');
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
  await field(dialog, '声', '');
  await field(dialog, 'いつも加える話し方', '常時の話し方');
  await field(dialog, '指定がないときの話し方', '登録の話し方');
  await dialog.getByRole('tab', { name: '詳細設定', exact: true }).click();
  await dialog.getByLabel('ニュアンスの送信方式', { exact: true }).selectOption('json');
  await save(dialog);
  const beforePreview = (await snapshot()).settings.value.tts;
  for (const instructions of ['試聴だけの話し方', '']) {
    await page.getByLabel('試聴の話し方', { exact: true }).fill(instructions);
    const count = requests.length;
    await page.getByRole('button', { name: '試聴する', exact: true }).click();
    await until(() => requests.length > count, 'blank voice preview request');
    await until(async () => {
      const model = await page.evaluate(() =>
        window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        ),
      );
      return model.content.auxiliary.tts.jobs.at(-1)?.state === 'completed';
    }, 'blank voice preview completion');
    assert.equal(Object.hasOwn(requests.at(-1).body, 'voice'), false);
    assert.equal(
      requests.at(-1).body.instructions,
      '常時の話し方\n' + (instructions || '登録の話し方'),
    );
    assert.deepEqual((await snapshot()).settings.value.tts, beforePreview);
  }
  checks.push(
    'blank voice previews omit voice; preview instructions override or inherit without changing saved server settings',
  );

  dialog = await edit('Secondary');
  await dialog.getByRole('tab', { name: '詳細設定', exact: true }).click();
  await dialog.getByLabel('ボイス一覧の取得方式', { exact: true }).selectOption('manual');
  assert.equal(await dialog.getByLabel('ボイス一覧のパス', { exact: true }).isVisible(), false);
  await dialog.getByRole('button', { name: '声を追加', exact: true }).click();
  await until(
    () => dialog.getByRole('button', { name: 'OK', exact: true }).isDisabled(),
    'invalid manual voices cannot be saved',
  );
  await field(dialog, '1行目の声のID', 'second-voice');
  await field(dialog, '1行目の声の表示名', 'Second');
  await dialog.getByRole('button', { name: '声を追加', exact: true }).click();
  await field(dialog, '2行目の声のID', 'second-voice');
  assert.equal(await dialog.getByRole('button', { name: 'OK', exact: true }).isDisabled(), true);
  await dialog.getByRole('tab', { name: '声・話し方', exact: true }).click();
  await dialog.getByRole('button', { name: '詳細設定の入力を確認', exact: true }).click();
  assert.equal(
    await dialog.getByLabel('2行目の声のID', { exact: true }).inputValue(),
    'second-voice',
  );
  await dialog.getByRole('button', { name: '2行目の声を削除', exact: true }).click();
  await dialog.getByRole('button', { name: 'JSONで編集', exact: true }).click();
  await field(dialog, '手動ボイス一覧', '{}');
  assert.equal(await dialog.getByRole('button', { name: 'OK', exact: true }).isDisabled(), true);
  await field(dialog, '手動ボイス一覧', '[{"id":"second-voice","name":"Second"}]');
  await dialog.getByRole('button', { name: '一覧で編集', exact: true }).click();
  await dialog.getByLabel('ボイス一覧の取得方式', { exact: true }).selectOption('endpoint');
  await dialog.getByLabel('ボイス一覧の取得方式', { exact: true }).selectOption('manual');
  assert.equal(
    await dialog.getByLabel('1行目の声のID', { exact: true }).inputValue(),
    'second-voice',
  );
  await field(dialog, '追加パラメーター（JSON）', '{');
  const invalidExtra = dialog.getByLabel('追加パラメーター（JSON）', { exact: true });
  await invalidExtra.press('Control+Enter');
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await dialog.getByRole('button', { name: 'OK', exact: true }).isDisabled(), true);
  await dialog.getByRole('tab', { name: '接続', exact: true }).click();
  await dialog.getByRole('button', { name: '詳細設定の入力を確認', exact: true }).click();
  assert.equal(await invalidExtra.inputValue(), '{');
  await field(dialog, '追加パラメーター（JSON）', '{}');
  await dialog.getByRole('tab', { name: '声・話し方', exact: true }).click();
  assert.equal(
    await dialog.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).count(),
    0,
  );
  await dialog.getByRole('combobox', { name: '声', exact: true }).click();
  await dialog.getByRole('option', { name: 'second-voice Second', exact: true }).click();
  await save(dialog);
  checks.push(
    'tabs retain invalid drafts and candidates; duplicate IDs and invalid JSON cannot save through OK or Ctrl+Enter',
  );
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
    await page.getByLabel('試聴の話し方', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, theme + '-preview.png') });
    dialog = await edit('Primary');
    await dialog.getByRole('tab', { name: '接続', exact: true }).focus();
    await dialog.getByRole('tab', { name: '接続', exact: true }).press('ArrowRight');
    assert.equal(
      await dialog
        .getByRole('tab', { name: '声・話し方', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );
    await dialog.getByLabel('モデル', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, theme + '-dialog.png') });
    const positions = [];
    for (const name of ['接続', '声・話し方', '詳細設定']) {
      await dialog.getByRole('tab', { name, exact: true }).click();
      const confirm = dialog.getByRole('button', { name: 'OK', exact: true });
      const box = await confirm.boundingBox();
      assert(box && box.y >= 0 && box.y + box.height <= (await page.evaluate(() => innerHeight)));
      positions.push(box.y);
      assert.equal(await dialog.getByRole('tabpanel').count(), 1);
      assert.equal(await dialog.getByRole('tabpanel', { name, exact: true }).isVisible(), true);
      assert.equal(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      );
      await page.screenshot({ path: path.join(profile, `${theme}-dialog-${name}.png`) });
    }
    assert(
      Math.max(...positions) - Math.min(...positions) < 2,
      'tab changes retain footer position',
    );
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
  await dialog.getByRole('tab', { name: '声・話し方', exact: true }).click();
  await until(
    async () =>
      (await dialog.getByLabel('いつも加える話し方', { exact: true }).inputValue()) ===
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
    await dialog.getByLabel('いつも加える話し方', { exact: true }).inputValue(),
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
      await field(editDialog, 'いつも加える話し方', value);
      await save(editDialog);
    },
    setNuanceMode: async (mode) => {
      const editDialog = await edit('Primary');
      await editDialog.getByRole('tab', { name: '詳細設定', exact: true }).click();
      await editDialog.getByLabel('ニュアンスの送信方式', { exact: true }).selectOption(mode);
      await save(editDialog);
    },
  };
};
