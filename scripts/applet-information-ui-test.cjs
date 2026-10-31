const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `applet-information-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [],
  requests = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const description = '半透明の時計と日付を表示します。\n<b>説明はプレーンテキスト</b>';
const tagline = '毎日の時刻を、ひと目で。';
const realApplets = [];
const source = process.argv[2] && path.resolve(process.argv[2]);
let app,
  page,
  server,
  success = false,
  failFeed = false;
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(label);
}
function fixture(settings, id, extra, enabled = true, fail = false) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      displayName: id,
      version: '1.0.0',
      minimumHostVersion: '0.36.8',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['settings'],
      settings: [{ key: 'text', title: '表示する文字', type: 'string', default: '' }],
      ...extra,
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'index.cjs'),
    `
    const fs = require('node:fs'), path = require('node:path');
    exports.activate = async () => {
      if (fs.existsSync(path.join(__dirname, 'gate')))
        await new Promise(resolve => {
          const timer = setInterval(() => {
            if (fs.existsSync(path.join(__dirname, 'release'))) { clearInterval(timer); resolve(); }
          }, 20);
        });
      ${fail ? "throw Error('fixture activation failed');" : ''}
    };
  `,
  );
  settings.extensions[id] = { enabled, settings: {} };
  return folder;
}
(async () => {
  try {
    server = http.createServer((req, res) => {
      requests.push(req.url);
      res.writeHead(failFeed ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'applet',
          id: 'fixture.info',
          version: '1.1.0',
          payload: { file: 'update.zip', format: 'zip', sha256: 'a'.repeat(64), size: 20 },
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    Object.assign(initial.host, {
      hardwareAcceleration: false,
      soundEnabled: false,
      closeToTray: false,
      theme: 'light',
      showHints: false,
    });
    initial.keybindings = [];
    initial.globalShortcutCommands = [];
    initial.gestures.enabled = false;
    initial.touchpadGestures.enabled = false;
    Object.assign(initial.updates, {
      checkHostOnStartup: false,
      checkHostOnAboutOpen: false,
      checkAppletsOnStartup: false,
    });
    const runningFolder = fixture(initial, 'fixture.info', {
      description,
      icon: 'clock',
      tagline,
      updateRepository: 'fixture/info',
    });
    fixture(initial, 'fixture.empty', {}, false);
    fixture(initial, 'fixture.failed', { updateRepository: 'fixture/failed' }, true, true);
    fixture(initial, 'fixture.delayed', { startupDelaySeconds: 600 });
    initial.extensions['fixture.info'].updateSource =
      `http://127.0.0.1:${server.address().port}/info.json`;
    if (process.argv.includes('--real-applets')) {
      const { getPublishDirectory } = require('./publish-paths.cjs');
      for (const dir of fs.readdirSync(path.dirname(root), { withFileTypes: true })) {
        if (!dir.isDirectory() || !dir.name.startsWith('Applet.')) continue;
        const repo = path.join(path.dirname(root), dir.name);
        const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'extension.json')));
        const output = getPublishDirectory(repo);
        const folder = fs.existsSync(path.join(output, 'extensions', manifest.id))
          ? path.join(output, 'extensions', manifest.id)
          : path.join(output, dir.name);
        assert.equal(
          hash(path.join(folder, 'extension.json')),
          hash(path.join(repo, 'extension.json')),
        );
        fs.cpSync(folder, path.join(profile, 'extensions', manifest.id), { recursive: true });
        initial.extensions[manifest.id] = { enabled: false, settings: {} };
        (initial.keybindingDefaultsInitialized ??= []).push(manifest.id);
        (initial.gestureDefaultsInitialized ??= []).push(manifest.id);
        realApplets.push({
          ...manifest,
          manifestSha256: hash(path.join(folder, 'extension.json')),
          entrySha256: hash(path.join(folder, manifest.entry)),
        });
      }
    }
    fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(initial));
    const exe = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (source) {
      require('./copy-host.cjs').copyHost(source, exe);
      assert.equal(hash(exe), hash(source));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await launchTestHost({
      executablePath: exe,
      portable: !!source,
      env,
      args: [
        ...(!source ? [root] : []),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
      ],
    });
    await until(async () => {
      page = app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/'));
      const state = page && (await page.evaluate(() => window.dock?.snapshot()));
      return (
        state?.startupReady &&
        state.extensions.some((a) => a.id === 'fixture.info' && a.state === 'running')
      );
    }, 'host ready');
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await app.evaluate(({ shell }) => {
      globalThis.__repositoryLinks = [];
      globalThis.__repositoryOpenFailure = false;
      shell.openExternal = async (url) => {
        if (globalThis.__repositoryOpenFailure) throw Error('fixture browser unavailable');
        globalThis.__repositoryLinks.push(url);
      };
    });
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    const bindings = require('../out/main/shared/keybindings').getKeybindings(
      (await snapshot()).settings.value,
    );
    assert(
      bindings.every((row) =>
        row.key.split('+').every((key) => !/^(Pause|F1[3-9]|F2[0-4])$/.test(key)),
      ),
      'metadata fixtures do not register reserved test keys',
    );
    const select = async (id) => {
      await page.getByTestId(`settings-nav:applet:${id}`).click();
      await page.getByRole('heading', { name: id, exact: true, level: 1 }).waitFor();
      await page.getByTestId('applet-information').waitFor();
    };
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(page);
    await select('fixture.info');
    const info = page.getByTestId('applet-information');
    const timing = page.getByTestId('applet-startup-timing');
    assert.equal(
      await page.getByRole('heading', { name: 'fixture.info', exact: true, level: 1 }).count(),
      1,
    );
    assert.equal(
      await page
        .getByText(require('../src/shared/locales/ja/host.json')['settings.appletDescription'], {
          exact: true,
        })
        .count(),
      0,
    );
    assert(
      await info.evaluate(
        (element) =>
          !!(
            element.compareDocumentPosition(
              document.querySelector('[data-testid="settings-page-tools"]'),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    );
    assert(await info.getByRole('button', { name: 'このAppletを更新', exact: true }).isVisible());
    assert.equal(await info.getByTestId('app-identity-tagline').innerText(), tagline);
    assert.equal(await info.getByTestId('applet-identity-icon').getAttribute('data-icon'), 'clock');
    assert.equal(await info.getByTestId('applet-description').innerText(), description);
    assert.equal(await info.locator('b').count(), 0);
    assert.equal(await info.getByTestId('applet-information-state').innerText(), '実行中');
    assert.equal(await timing.getAttribute('open'), null);
    assert(await timing.getByText('起動時間の計測', { exact: true }).isVisible());
    assert(
      await timing.evaluate((element) => element === element.parentElement.lastElementChild),
      'startup timing follows Applet settings, display settings and common settings',
    );
    const details = info.getByTestId('applet-information-details');
    assert(await details.getByText('fixture.info', { exact: true }).isVisible());
    assert(await details.getByText('0.36.8', { exact: true }).isVisible());
    assert(await details.getByText('配布元', { exact: true }).isVisible());
    assert(await details.getByText('fixture/info', { exact: true }).isVisible());
    const repositoryLink = details.getByRole('link', { name: 'fixture/info', exact: true });
    assert.equal(await repositoryLink.getAttribute('href'), 'https://github.com/fixture/info');
    const settingsBeforeLink = (await snapshot()).settings.value;
    const hostUrl = page.url();
    await repositoryLink.click();
    await until(
      async () => (await app.evaluate(() => globalThis.__repositoryLinks.length)) === 1,
      'repository pointer click',
    );
    await repositoryLink.focus();
    await page.keyboard.press('Enter');
    await until(
      async () => (await app.evaluate(() => globalThis.__repositoryLinks.length)) === 2,
      'repository keyboard activation',
    );
    await repositoryLink.click({ button: 'middle' });
    await until(
      async () => (await app.evaluate(() => globalThis.__repositoryLinks.length)) === 3,
      'repository middle click',
    );
    await app.evaluate(() => {
      globalThis.__repositoryOpenFailure = true;
    });
    await repositoryLink.click();
    await page.getByRole('alert').filter({ hasText: '配布元をブラウザーで開く' }).waitFor();
    await app.evaluate(() => {
      globalThis.__repositoryOpenFailure = false;
    });
    await repositoryLink.click();
    await until(
      async () => (await app.evaluate(() => globalThis.__repositoryLinks.length)) === 4,
      'repository retry',
    );
    assert.deepEqual(
      await app.evaluate(() => globalThis.__repositoryLinks),
      Array(4).fill('https://github.com/fixture/info'),
    );
    assert.equal(page.url(), hostUrl);
    assert.deepEqual((await snapshot()).settings.value, settingsBeforeLink);
    assert.deepEqual(requests, []);
    checks.push(
      'manifest repository link opens through the external browser with pointer, Enter and middle click before update checks; overrides, settings and host navigation unchanged; launch failure can retry',
    );
    const denied = await page.evaluate(async () => {
      const connection = document.querySelector('.settings-surface').dataset.settingsConnection;
      const results = [];
      for (const name of [
        'checkUpdates',
        'installUpdates',
        'openReleases',
        'openAppletRepository',
      ]) {
        for (const id of ['fixture.empty', 'host', 'all', undefined]) {
          const model = await window.dock.settingsPage.get(connection);
          if (model.content.actions.checkAllUpdates || model.content.actions.cancelUpdates)
            throw Error('Applet page exposes a global update action');
          if (!model.content.actions[name]) throw Error(`Missing Applet update action: ${name}`);
          try {
            await window.dock.settingsPage.act(connection, {
              id: model.id,
              type: 'settings',
              sessionId: model.content.editing.sessionId,
              editRevision: model.content.editing.editRevision,
              operationId: crypto.randomUUID(),
              operation: { kind: 'invoke', actionId: model.content.actions[name], args: [id] },
            });
            results.push(false);
          } catch {
            results.push(true);
          }
        }
      }
      return results;
    });
    assert.equal(denied.length, 16);
    assert(denied.every(Boolean));
    const managementDenied = await page.evaluate(async () => {
      const connection = document.querySelector('.settings-surface').dataset.settingsConnection;
      const results = [];
      for (const [name, args] of [
        ['manageApplet', ['fixture.empty', 'restart']],
        ['manageApplet', ['fixture.info', 'enable']],
        ['manageApplet', ['fixture.info', 'disable']],
        ['prepareAppletUninstall', ['fixture.empty']],
      ]) {
        const model = await window.dock.settingsPage.get(connection);
        if (model.content.actions.prepareAppletInstall || model.content.actions.reorderApplets)
          throw Error('Applet information exposes global management');
        {
          if (!model.content.actions[name]) throw Error(`Missing management action: ${name}`);
          try {
            await window.dock.settingsPage.act(connection, {
              id: model.id,
              type: 'settings',
              sessionId: model.content.editing.sessionId,
              editRevision: model.content.editing.editRevision,
              operationId: crypto.randomUUID(),
              operation: { kind: 'invoke', actionId: model.content.actions[name], args },
            });
            results.push(false);
          } catch {
            results.push(true);
          }
        }
      }
      return results;
    });
    assert(managementDenied.every(Boolean));
    assert.deepEqual(requests, []);
    await page.getByRole('button', { name: 'このAppletの更新を確認', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).updates.results.some(
          (row) => row.id === 'fixture.info' && row.status === 'available',
        ),
      'single Applet metadata',
    );
    await info.getByLabel('更新後のバージョン 1.1.0').waitFor();
    assert.deepEqual(requests, ['/info.json']);
    assert(await info.getByRole('button', { name: 'このAppletを更新', exact: true }).isVisible());
    if (source) {
      const settingsBeforeRemoval = (await snapshot()).settings.value;
      const uninstall = info.getByRole('button', { name: 'アンインストール', exact: true });
      await uninstall.click();
      const dialog = page.getByRole('dialog', { name: 'Appletをアンインストール' });
      await dialog.waitFor();
      assert((await dialog.innerText()).includes('設定と保存データは残ります'));
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await until(
        () => uninstall.evaluate((el) => document.activeElement === el),
        'uninstall cancel focus',
      );
      assert(fs.existsSync(path.join(runningFolder, 'extension.json')));
      assert.deepEqual((await snapshot()).settings.value, settingsBeforeRemoval);
      checks.push(
        'information uninstall confirmation cancels without deleting files or settings and returns focus',
      );
      await app.evaluate(({ dialog }) => {
        globalThis.__appletUpdateConfirmations = [];
        globalThis.__appletUpdateOriginalDialog = dialog.showMessageBox;
        dialog.showMessageBox = async (_window, options) => {
          globalThis.__appletUpdateConfirmations.push(options.detail);
          return { response: options.cancelId, checkboxChecked: false };
        };
      });
      const requestStart = requests.length;
      await info.getByRole('button', { name: 'このAppletを更新', exact: true }).click();
      await until(
        async () =>
          !(await snapshot()).updates.busy &&
          (await app.evaluate(() => globalThis.__appletUpdateConfirmations.length)) === 1,
        'single Applet update confirmation',
      );
      const confirmations = await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = globalThis.__appletUpdateOriginalDialog;
        return globalThis.__appletUpdateConfirmations;
      });
      assert.deepEqual(confirmations, ['fixture.info 1.0.0 → 1.1.0']);
      assert.deepEqual(requests.slice(requestStart), ['/info.json']);
      checks.push(
        'permanent update action confirms only the selected Applet; cancelling downloads no payload',
      );
    }
    checks.push(
      'plain-text overview and metadata stay visible without hints or expansion; scoped update actions reject other owners and groups; metadata only without payload download',
    );
    await timing.locator(':scope > summary').focus();
    await page.keyboard.press('Space');
    await timing.locator('.settings-section-row > summary').click();
    const data = timing.getByTestId('applet-startup-json');
    assert.deepEqual(
      JSON.parse(await data.inputValue()),
      (await snapshot()).extensions.find((a) => a.id === 'fixture.info').startupTiming,
    );
    assert.equal(await data.getAttribute('readonly'), '');
    for (const label of [
      'ホストの開始準備',
      'プロセスの起動要求',
      '接続・初期化の応答待ち',
      '登録内容の確認',
    ])
      assert(await timing.getByRole('cell', { name: label, exact: true }).isVisible());
    fs.writeFileSync(path.join(runningFolder, 'gate'), '');
    await info.getByRole('button', { name: '再起動', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).extensions.find((a) => a.id === 'fixture.info').state === 'starting',
      'restart starts',
    );
    await timing.getByText('計測中…', { exact: true }).waitFor();
    assert.equal(await timing.getByTestId('applet-startup-json').count(), 0);
    fs.writeFileSync(path.join(runningFolder, 'release'), '');
    await until(
      async () =>
        (await snapshot()).extensions.find((a) => a.id === 'fixture.info').state === 'running',
      'restart complete',
    );
    await timing.getByText('直近の起動処理は完了しています。', { exact: true }).waitFor();
    checks.push(
      'actual phase timings and read-only data; restart clears old measurement then updates live',
    );
    await page.getByLabel('表示する文字', { exact: true }).fill('saved');
    await page.getByLabel('表示する文字', { exact: true }).press('Enter');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.info'].settings.text,
      'saved',
    );
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const jsonInput = page.getByLabel('設定JSON', { exact: true });
    await jsonInput.waitFor();
    assert.equal(await info.count(), 0);
    const jsonValue = JSON.parse(await jsonInput.inputValue());
    jsonValue.extensions['fixture.info'].settings.text = 'saved through JSON';
    await jsonInput.fill(JSON.stringify(jsonValue, null, 2));
    await jsonInput.press('Enter');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.info'].settings.text,
      'saved through JSON',
    );
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    await info.waitFor();
    assert.equal(
      await page.getByLabel('表示する文字', { exact: true }).inputValue(),
      'saved through JSON',
    );
    checks.push(
      'information replaces the form heading above the toolbar; JSON edits save and survive returning to the form',
    );
    await select('fixture.empty');
    assert.equal(await info.getByRole('link').count(), 0);
    assert(await info.getByRole('button', { name: '再起動', exact: true }).isDisabled());
    assert.equal(await info.getByTestId('app-identity-tagline').count(), 0);
    assert.equal(
      await info.getByTestId('applet-identity-icon').getAttribute('data-icon'),
      'extensions',
    );
    assert.equal(await info.getByTestId('applet-description').count(), 0);
    assert.equal(await info.getByTestId('applet-information-state').innerText(), '停止中');
    assert(await info.getByRole('button', { name: 'このAppletの更新を確認' }).isDisabled());
    assert(await info.getByRole('button', { name: 'このAppletを更新' }).isDisabled());
    await timing.locator(':scope > summary').click();
    await timing
      .getByText('今回のAppDock起動中には、まだこのAppletを起動していません。', { exact: true })
      .waitFor();
    assert.equal(
      (await snapshot()).extensions.find((a) => a.id === 'fixture.empty').state,
      'stopped',
    );
    await select('fixture.delayed');
    assert.equal(await info.getByTestId('applet-information-state').innerText(), '開始待ち');
    await timing.locator(':scope > summary').click();
    await timing
      .getByText('今回のAppDock起動中には、まだこのAppletを起動していません。', { exact: true })
      .waitFor();
    await select('fixture.failed');
    await info.getByRole('link', { name: 'fixture/failed', exact: true }).click();
    await until(
      async () =>
        (await app.evaluate(() => globalThis.__repositoryLinks.at(-1))) ===
        'https://github.com/fixture/failed',
      'failed Applet repository opens without starting it',
    );
    assert.equal(
      (await snapshot()).extensions.find((a) => a.id === 'fixture.failed').state,
      'error',
    );
    await timing.locator(':scope > summary').click();
    await timing.getByText('失敗した区間までを計測しています。', { exact: true }).waitFor();
    assert(!(await timing.getByRole('cell', { name: '登録内容の確認', exact: true }).count()));
    checks.push(
      'stopped, delayed, missing-description and partial failure remain readable without activating Applets; setting saves preserved',
    );
    await page.getByTestId('settings-nav:applets').click();
    await page.getByLabel('Appletを検索', { exact: true }).fill('毎日の時刻');
    await settleSettings(page);
    await page.locator('[data-applet-id="fixture.info"]').waitFor();
    assert.equal(await page.locator('[data-applet-id]').count(), 1);
    const overviewIcon = page
      .locator('[data-applet-id="fixture.info"]')
      .getByRole('button', { name: 'fixture.infoの説明' });
    await overviewIcon.focus();
    const overviewTooltip = page.getByRole('tooltip');
    await overviewTooltip.waitFor();
    assert.equal(await overviewTooltip.innerText(), description);
    await page.keyboard.press('Escape');
    assert(await overviewTooltip.isHidden());
    await page.getByLabel('設定を検索', { exact: true }).fill('毎日の時刻');
    await page.getByRole('option').filter({ hasText: 'Appletについて' }).click();
    await info.getByTestId('applet-description').waitFor();
    await page.getByLabel('設定を検索', { exact: true }).fill('');
    await select('fixture.info');
    await timing.locator(':scope > summary').click();
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.setSize(1180, 900);
      w.show();
    });
    await info.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, 'light-wide.png') });
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
        .setSize(700, 850);
    });
    await info.scrollIntoViewIfNeeded();
    assert.equal(await info.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    await page.screenshot({ path: path.join(profile, 'dark-narrow.png') });
    await timing.scrollIntoViewIfNeeded();
    assert.equal(await timing.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    await page.screenshot({ path: path.join(profile, 'timing-narrow.png') });
    failFeed = true;
    await info.getByRole('button', { name: 'このAppletの更新を確認' }).click();
    await until(
      async () =>
        (await snapshot()).updates.results.some(
          (row) => row.id === 'fixture.info' && row.status === 'error',
        ),
      'metadata error',
    );
    await page.getByRole('alert').filter({ hasText: 'このAppletの更新を確認' }).waitFor();
    checks.push(
      'overview search navigates to information; management searches description; representative light/dark narrow view; metadata errors use common feedback',
    );
    for (const manifest of realApplets) {
      await page.getByTestId(`settings-nav:applet:${manifest.id}`).click();
      await page
        .getByRole('heading', { name: manifest.displayName, exact: true, level: 1 })
        .waitFor();
      await info.getByText(manifest.tagline, { exact: true }).waitFor();
      await info.getByRole('button', { name: 'このAppletを更新', exact: true }).waitFor();
      assert.equal(
        await info.getByTestId('applet-identity-icon').getAttribute('data-icon'),
        manifest.icon,
      );
      assert.equal(await info.getByTestId('applet-description').innerText(), manifest.description);
      assert.equal(
        (await snapshot()).extensions.find((a) => a.id === manifest.id).state,
        'stopped',
      );
      if (manifest.id === 'at365.watch') {
        await info.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(profile, 'watch-branding.png') });
      }
    }
    if (realApplets.length)
      checks.push(
        `all ${realApplets.length} published Applet identities render without activating them`,
      );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(profile, 'extensions/fixture.info/release'), '');
    await app?.close().catch((error) => {
      errors.push(String(error));
      success = false;
      process.exitCode = 1;
    });
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    const result = {
      success,
      checks,
      errors,
      requests,
      profile,
      version: require('../package.json').version,
      portable: source ? hash(source) : null,
      realApplets: realApplets.map(
        ({ id, version, icon, tagline, manifestSha256, entrySha256 }) => ({
          id,
          version,
          icon,
          tagline,
          manifestSha256,
          entrySha256,
        }),
      ),
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
