const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { newAiConnection } = require('../out/main/shared/ai');
const { newTtsServer } = require('../out/main/shared/tts');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const fixture = require('./test-settings.cjs');
const profile = path.resolve('.artifacts/generation-local-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [];
let host;
const snapshot = () => host.main.evaluate(() => window.dock.snapshot());
const check = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
(async () => {
  try {
    const value = createDefaultSettings();
    value.host.theme = 'light';
    value.keybindings = [];
    value.gestures.enabled = false;
    value.updates = {
      ...value.updates,
      checkHostOnStartup: false,
      checkAppletsOnStartup: false,
      checkHostOnAboutOpen: false,
    };
    value.ai = {
      connections: [
        {
          ...newAiConnection('text'),
          name: 'Text fixture',
          baseUrl: 'http://127.0.0.1:1/v1',
          defaultModel: 'model',
        },
      ],
      defaultConnectionId: 'text',
    };
    value.tts = {
      connections: [
        {
          ...newTtsServer('voice'),
          name: 'Voice fixture',
          baseUrl: 'http://127.0.0.1:1/v1',
          model: 'model',
        },
      ],
      defaultConnectionId: 'voice',
    };
    value.imageAi = {
      connections: [
        {
          ...newImageAiConnection('image'),
          name: 'Image fixture',
          baseUrl: 'http://127.0.0.1:1/v1',
          authentication: 'none',
        },
      ],
      defaultConnectionId: 'image',
    };
    fixture.write(profile, value);
    host = await launch(profile, process.argv[2]);
    await host.app.evaluate(({ clipboard }) => {
      globalThis.copiedServerId = undefined;
      clipboard.writeText = (text) => {
        globalThis.copiedServerId = text;
      };
    });
    const page = host.main;
    const checkCopy = async (dialog, id) => {
      const revision = (await snapshot()).settings.revision;
      await dialog.getByRole('button', { name: 'サーバーIDをコピー', exact: true }).click();
      await dialog
        .getByRole('status')
        .filter({ hasText: 'サーバーIDをコピーしました。' })
        .waitFor();
      assert.equal(await host.app.evaluate(() => globalThis.copiedServerId), id);
      assert.equal((await snapshot()).settings.revision, revision);
    };
    for (const [id, key, name, serverType] of [
      ['ai', 'ai', 'Text fixture', '文章生成サーバー'],
      ['tts', 'tts', 'Voice fixture', '音声生成サーバー'],
      ['image-ai', 'imageAi', 'Image fixture', '画像生成サーバー'],
    ]) {
      await page.evaluate(
        (id) => window.dock.executeCommand('appdock.settings.' + id + '.open'),
        id,
      );
      await settingsPage(page);
      const inputLabel = id === 'tts' ? '入力データ' : '試験の入力データ';
      await page
        .getByLabel(inputLabel, { exact: true })
        .locator('xpath=ancestor::section[1]')
        .screenshot({ path: path.join(profile, id + '-trial.png') });
      assert.equal(
        await page.getByRole('switch', { name: 'このPCで設定を保存する', exact: true }).count(),
        0,
      );
      const table = page.getByRole('table').filter({
        has: page.getByRole('columnheader', { name: 'MCP公開', exact: true }),
      });
      const row = table.getByRole('row').filter({ hasText: name });
      const publication = (name) => row.getByRole('cell', { name, exact: true });
      await publication('非公開').waitFor();
      const savedId = value[key].connections[0].id;
      const serverId = async (dialog) => {
        const fields = await dialog
          .getByRole('tabpanel')
          .locator('input[aria-label], select[aria-label]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
        assert.deepEqual(fields.slice(0, 4), [
          '登録名',
          'サーバーID',
          'サーバーの種類',
          'APIのURL',
        ]);
        const idInput = dialog.getByRole('textbox', { name: 'サーバーID', exact: true });
        assert.equal(await idInput.isEditable(), false);
        return idInput.inputValue();
      };
      const add = page.getByRole('button', { name: serverType + 'を追加', exact: true });
      await add.click();
      const addDialog = page.getByRole('dialog', { name: serverType + 'を追加', exact: true });
      await addDialog.waitFor();
      const newId = await serverId(addDialog);
      assert.ok(newId && newId !== savedId);
      if (id === 'image-ai')
        await addDialog.screenshot({ path: path.join(profile, 'image-ai-copy-id.png') });
      await checkCopy(addDialog, newId);
      await addDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      const open = async () => {
        await page.getByRole('button', { name: name + 'の設定', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: serverType + 'を編集', exact: true });
        await dialog.waitFor();
        return dialog;
      };
      let dialog = await open();
      assert.equal(await serverId(dialog), savedId);
      check(id + ': add and edit show the server ID in the shared connection field order');
      await checkCopy(dialog, savedId);
      check(id + ': copy writes the draft or saved ID without committing settings');
      if (id === 'image-ai') {
        await dialog.getByRole('tab', { name: '生成設定', exact: true }).click();
        const model = dialog.getByRole('textbox', { name: 'モデル', exact: true });
        assert.equal(await model.isEditable(), true);
        assert.equal(
          await dialog.getByText(/利用する画像生成モデルのIDを入力してください/).count(),
          0,
        );
        await dialog.getByRole('tab', { name: '接続', exact: true }).click();
        check('image-ai: edit the registered model through its Model field');
      }
      const authentication = dialog.getByLabel('認証方式', { exact: true });
      assert.equal(await authentication.inputValue(), 'none');
      assert.equal(await dialog.getByLabel('APIキー', { exact: true }).count(), 0);
      await authentication.selectOption('bearer');
      await dialog.getByLabel('APIキー', { exact: true }).fill('discarded-fixture-key');
      await authentication.selectOption('none');
      assert.equal(await dialog.getByLabel('APIキー', { exact: true }).count(), 0);
      await authentication.selectOption('bearer');
      assert.equal(
        await dialog.getByLabel('APIキー', { exact: true }).inputValue(),
        'discarded-fixture-key',
      );
      await dialog.screenshot({ path: path.join(profile, id + '-authentication.png') });
      let toggle = dialog.getByRole('switch', { name: 'MCPからの利用を許可', exact: true });
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await toggle.click();
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      assert.notEqual((await snapshot()).settings.value[key].connections[0].mcpEnabled, true);
      await publication('非公開').waitFor();
      assert.equal((await snapshot()).settings.value[key].connections[0].authentication, 'none');
      dialog = await open();
      toggle = dialog.getByRole('switch', { name: 'MCPからの利用を許可', exact: true });
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await toggle.click();
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      await until(
        async () => (await snapshot()).settings.value[key].connections[0].mcpEnabled === true,
        'saved ' + id,
      );
      await publication('公開').waitFor();
      await table.screenshot({ path: path.join(profile, id + '-servers.png') });
      check(id + ': server list shows the saved MCP publication state');
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(profile, 'data/generation-ai.json')))[key]
          .connections[0].mcpEnabled,
        true,
      );
      assert.equal(JSON.parse(fs.readFileSync(fixture.file(profile)))[key], undefined);
      check(id + ': local permission defaults OFF, cancel discards and OK saves');
      check(
        id +
          ': authentication toggle preserves the draft and cancel leaves the saved mode unchanged',
      );
    }
    await host.save({ host: { theme: 'dark' } });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await host.resize(736, 720);
    await page.screenshot({ path: path.join(profile, 'image-ai-servers-narrow.png') });
    await page.getByRole('button', { name: 'Image fixtureの設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('switch', { name: 'MCPからの利用を許可', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, 'permission-dialog.png') });
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.notifications.open'));
    await settingsPage(page);
    await page.getByTestId('notification-delivery').locator(':scope > summary').click();
    await page.getByTestId('notification-speech').locator(':scope > summary').click();
    const select = page.getByLabel('使用する音声サーバー', { exact: true });
    await select.selectOption('voice');
    await until(
      async () =>
        (await snapshot()).settings.value.notificationPreferences?.speech?.connectionId === 'voice',
      'notification server saved',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'data/generation-ai.json')))
        .notificationConnectionId,
      'voice',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(fixture.file(profile))).notificationPreferences?.speech
        ?.connectionId,
      undefined,
    );
    check('notification server saves only to the local generator file');
    await host.close();
    host = await launch(profile, process.argv[2]);
    const reopened = (await snapshot()).settings.value;
    for (const key of ['ai', 'tts', 'imageAi'])
      assert.equal(reopened[key].connections[0].mcpEnabled, true);
    assert.equal(reopened.notificationPreferences.speech.connectionId, 'voice');
    check('all three permissions and notification server survive a real restart');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success: true, checks, hash: host.hash }, null, 2),
    );
  } finally {
    await host?.close();
  }
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
  process.exitCode = 1;
});
