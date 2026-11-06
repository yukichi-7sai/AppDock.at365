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
    const page = host.main;
    for (const [id, key, name] of [
      ['ai', 'ai', 'Text fixture'],
      ['tts', 'tts', 'Voice fixture'],
      ['image-ai', 'imageAi', 'Image fixture'],
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
      const open = async () => {
        await page.getByRole('button', { name: name + 'の設定', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        return dialog;
      };
      let dialog = await open();
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
    // The image permission remains editable before the image MCP API is published.
    await page.getByRole('button', { name: 'Image fixtureの設定', exact: true }).click();
    await host.resize(736, 720);
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
