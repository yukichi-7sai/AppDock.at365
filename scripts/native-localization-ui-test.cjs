// Real host/helpers, with invalid input targets: no OS input, hooks or touchpad writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(artifacts, 'native-localization-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
fs.mkdirSync(path.join(profile, 'translations'));
fs.writeFileSync(
  path.join(profile, 'translations/host_en.json'),
  JSON.stringify({
    'native.input.failed': 'Input was not completed.',
    'native.updater.extractDestination': 'The extraction folder already exists.',
  }),
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  closeToTray: false,
  hardwareAcceleration: false,
  soundEnabled: false,
  notifications: false,
});
settings.globalShortcutCommands = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.updates.checkHostOnStartup =
  settings.updates.checkAppletsOnStartup =
  settings.updates.checkHostOnAboutOpen =
    false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const result = { ok: false, profile, checks: [] };
(async () => {
  let instance;
  try {
    instance = await launch(profile, portable);
    result.sha256 = instance.hash;
    for (const language of ['ja', 'en', 'ja']) {
      await instance.save({ host: { language } });
      const expected =
        language === 'en'
          ? 'Input was not completed.'
          : '入力操作が完了しませんでした。送信先・キーの押下状態・権限を確認してください。';
      await until(
        async () =>
          instance.app
            .evaluate(({ app }) => {
              const req = process
                .getBuiltinModule('module')
                .createRequire(app.getAppPath() + '/package.json');
              return req('./out/main/shared/host-language').effectiveHostLanguage();
            })
            .then((value) => value === language),
        'main language updated',
      );
      const actual = await instance.app.evaluate(async ({ app }, profile) => {
        const req = process
          .getBuiltinModule('module')
          .createRequire(app.getAppPath() + '/package.json');
        const path = req('node:path');
        const bin = app.isPackaged
          ? process.resourcesPath
          : path.join(app.getAppPath(), '.artifacts');
        const native = req('./out/main/main/core/native-messages');
        const { NativeInput } = req('./out/main/main/core/native-input');
        globalThis.localizationInput ??= new NativeInput(
          path.join(bin, 'dotnet-host/input/AppDock.InputHost.exe'),
        );
        const capture = async (fn) => {
          try {
            await fn();
            return { unexpectedSuccess: true };
          } catch (error) {
            return { code: error.code, message: error.message };
          }
        };
        return {
          input: await capture(() =>
            globalThis.localizationInput.send('input.sendKeys', { keys: 'Ctrl+A' }, 'fixture', {
              window: '-1',
            }),
          ),
          updater: await capture(() =>
            native.executeNativeHelper(
              path.join(bin, 'updater/AppDock.Updater.exe'),
              ['--extract', 'unused.zip', profile],
              { windowsHide: true },
            ),
          ),
          fallback: native.nativeMessage({ hostTextKey: 'native.input.cancelled', values: {} }),
          inputPid: globalThis.localizationInput.child?.pid,
        };
      }, profile);
      assert.deepEqual(actual.input, { code: 'INPUT_FAILED', message: expected });
      assert.equal(
        actual.updater.message,
        language === 'en'
          ? 'The extraction folder already exists.'
          : '展開先は空の新規フォルダーにしてください。',
      );
      assert.equal(actual.fallback, '入力操作は取り消されました。送信済みの入力は元に戻りません。');
      result.checks.push({ language, ...actual });
    }
    assert.equal(new Set(result.checks.map((row) => row.inputPid)).size, 1);
    await instance.app.evaluate(async () => {
      const input = globalThis.localizationInput;
      const child = input.child;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      input.close();
      await exited;
      delete globalThis.localizationInput;
    });
    result.ok = true;
  } finally {
    if (instance) {
      await instance.app
        .evaluate(() => {
          globalThis.localizationInput?.close();
        })
        .catch(() => {});
      await instance.close();
    }
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
