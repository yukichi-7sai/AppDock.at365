const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// This fixture records Electron dialog arguments and supplies explicit responses.
// It tests service behavior, not Windows-native layout or physical button input.
module.exports = async function ({
  host,
  select,
  snapshot,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
}) {
  assert.equal((await snapshot()).version, require('../package.json').version);
  const name = '<b>language.ja</b> {{name}} $t(language.ja)';
  const sharedBefore = fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8');
  await select('AI');
  await host.locator('[data-ai-connection="localization"] .ai-row-actions button').first().click();
  const editor = host.getByRole('dialog');
  await editor.getByRole('button', { name: 'モデル一覧を取得', exact: true }).click();
  await editor
    .getByRole('alert')
    .filter({ hasText: 'AIサーバーの認証を確認してください。' })
    .waitFor();
  assert.equal(await editor.getByLabel('AI接続の名前', { exact: true }).inputValue(), name);
  assert(!(await editor.innerText()).includes('private server detail'));
  await host.screenshot({ path: path.join(profile, 'service-ai-authentication.png') });
  await editor.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'), sharedBefore);
  checks.push(
    'AI service HTTP failure reaches the settings dialog in Japanese; custom name and shared settings remain unchanged',
  );

  const result = await inspect(
    inspector,
    `(${async function (electron, fixtureRoot, name) {
      const require = process
        .getBuiltinModule('module')
        .createRequire(electron.app.getAppPath() + '/package.json');
      const fs = require('node:fs'),
        path = require('node:path');
      const { RemotePageService } = require('./out/main/main/core/remote-pages');
      const { ImageLibraryHost } = require('./out/main/main/core/image-library-host');
      const dialogs = [],
        pickers = [],
        originalMessage = electron.dialog.showMessageBox,
        originalOpen = electron.dialog.showOpenDialog;
      let response = 0,
        service;
      fs.mkdirSync(fixtureRoot, { recursive: true });
      const file = path.join(fixtureRoot, 'accounts.json');
      const first = { id: 'account.00000000-0000-0000-0000-000000000001', name },
        second = { id: 'account.00000000-0000-0000-0000-000000000002', name: 'keep this account' };
      fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts: [first, second] }));
      const before = fs.readFileSync(file, 'utf8');
      try {
        electron.dialog.showMessageBox = async (...args) => {
          dialogs.push(args.at(-1));
          return { response, checkboxChecked: false };
        };
        electron.dialog.showOpenDialog = async (...args) => {
          pickers.push(args.at(-1));
          return { canceled: true, filePaths: [] };
        };
        service = new RemotePageService(
          () => [],
          path.join(fixtureRoot, 'local'),
          () => {},
          file,
        );
        const cancelled = await service.deleteAccount(first.id);
        const cancelPreserved = before === fs.readFileSync(file, 'utf8');
        const session = service.account(first.id);
        await session.cookies.set({
          url: 'https://localization.invalid',
          name: 'fixture',
          value: 'preserve',
        });
        const clearCancelled = await service.clearAccount(first.id);
        const cookiesAfterCancel = (await session.cookies.get({ name: 'fixture' })).length;
        response = 1;
        const cleared = await service.clearAccount(first.id);
        const cookiesAfterClear = (await session.cookies.get({ name: 'fixture' })).length;
        const deleted = await service.deleteAccount(first.id);
        const remaining = service.accounts();
        const pendingDeletion = service.profiles.pendingDeletion();
        const library = new ImageLibraryHost(
          {},
          {
            settings: {},
            window: () =>
              electron.BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().startsWith('appdock://host/'),
              ),
            writable() {},
            show() {},
          },
        );
        const registerCancelled = await library.register();
        const multiCancelled = await library.registerMany();
        return {
          dialogs,
          pickers,
          cancelled,
          cancelPreserved,
          clearCancelled,
          cookiesAfterCancel,
          cleared,
          cookiesAfterClear,
          deleted,
          remaining,
          pendingDeletion,
          registerCancelled,
          multiCancelled,
        };
      } finally {
        electron.dialog.showMessageBox = originalMessage;
        electron.dialog.showOpenDialog = originalOpen;
        await service?.close();
      }
    }.toString()})(${electronExpression}, ${JSON.stringify(path.join(profile, 'service-fixture'))}, ${JSON.stringify(name)})`,
  );
  assert.equal(result.cancelled, false);
  assert.equal(result.cancelPreserved, true);
  assert.equal(result.dialogs[0].message, `「${name}」のアカウント枠を削除しますか？`);
  assert.deepEqual(result.dialogs[0].buttons, ['キャンセル', '枠を削除']);
  assert.equal(result.dialogs[0].defaultId, 0);
  assert.equal(result.dialogs[0].cancelId, 0);
  assert.equal(
    result.dialogs[1].message,
    `「${name}」のログイン情報とサイトデータをクリアしますか？`,
  );
  assert.deepEqual(result.dialogs[1].buttons, ['キャンセル', 'クリア']);
  assert.equal(result.clearCancelled, false);
  assert.equal(result.cookiesAfterCancel, 1);
  assert.equal(result.cleared, true);
  assert.equal(result.cookiesAfterClear, 0);
  assert.equal(result.deleted, 'deferred');
  assert.deepEqual(result.pendingDeletion, ['account.00000000-0000-0000-0000-000000000001']);
  assert.deepEqual(
    result.remaining.map((a) => a.name),
    ['keep this account'],
  );
  checks.push(
    'Account delete/clear native-dialog arguments preserve literal names, button order and safe default/cancel IDs',
  );
  checks.push(
    'Dialog cancel preserves fixture data; acceptance clears only fixture cookies and removes only the chosen account while retaining its in-use session for deferred cleanup',
  );
  assert.deepEqual(
    result.pickers.map((p) => p.title),
    ['ライブラリーに画像を登録', 'ライブラリーに画像を追加'],
  );
  for (const picker of result.pickers) {
    assert.equal(picker.filters[0].name, '画像');
    assert.deepEqual(picker.filters[0].extensions, ['png', 'jpg', 'jpeg', 'webp']);
  }
  assert.equal(result.registerCancelled, null);
  assert.deepEqual(result.multiCancelled, []);
  checks.push(
    'Image open-dialog titles and filter labels are Japanese; cancellation creates no image',
  );
  fs.writeFileSync(path.join(profile, 'service-dialogs.json'), JSON.stringify(result, null, 2));
};
