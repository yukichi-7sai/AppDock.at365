const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process'),
  net = require('node:net');
const { createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-shell-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.globalShortcutCommands = [];
settings.extensions['missing.applet'] = { enabled: false, settings: { private: 'never-in-shell' } };
settings.host.closeToTray = false;
require('./profile-settings-fixture.cjs').installProfileSettings(profile, settings);
for (const id of ['fixture.settings-shell', 'fixture.stalled-settings', 'fixture.old-settings'])
  settings.extensions[id] = { enabled: true, settings: {} };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const fixture = path.join(profile, 'extensions', 'fixture.settings');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.settings',
    name: 'Settings fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    settings: [
      { key: 'text.value', title: 'Fixture text', type: 'string', default: '' },
      { key: 'amount', title: 'Fixture amount', type: 'number', default: 1 },
    ],
  }),
);
fs.writeFileSync(path.join(fixture, 'index.js'), 'module.exports = {};');
const external = path.join(profile, 'extensions', 'fixture.settings-shell');
fs.cpSync(path.join(root, 'out/shells/default'), external, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(external, 'extension.json')));
manifest.id = 'fixture.settings-shell';
manifest.name = 'Settings shell fixture';
manifest.minimumHostVersion = '0.33.0';
manifest.shell = { apiVersion: 1, views: { 'page.settings': 'settings.html' } };
fs.writeFileSync(
  path.join(external, 'settings.html'),
  '<body>Legacy settings must not be opened</body>',
);
fs.writeFileSync(path.join(external, 'extension.json'), JSON.stringify(manifest));
const stalled = path.join(profile, 'extensions', 'fixture.stalled-settings');
fs.mkdirSync(stalled, { recursive: true });
fs.writeFileSync(
  path.join(stalled, 'extension.json'),
  JSON.stringify({ ...manifest, id: 'fixture.stalled-settings', name: 'Stalled settings' }),
);
fs.writeFileSync(path.join(stalled, 'worker.cjs'), 'exports.activate=async()=>{};');
fs.writeFileSync(path.join(stalled, 'settings.html'), '<body>Not ready</body>');
const old = path.join(profile, 'extensions', 'fixture.old-settings');
fs.cpSync(external, old, { recursive: true });
fs.writeFileSync(
  path.join(old, 'extension.json'),
  JSON.stringify({ ...manifest, id: 'fixture.old-settings', minimumHostVersion: '0.32.0' }),
);
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function until(fn, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error(label);
}
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, context, child, connection, portable;
  async function launch(extra = []) {
    if (process.argv[2]) {
      portable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(path.resolve(process.argv[2]), portable);
      assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
      const probe = net.createServer();
      await new Promise((r) => probe.listen(0, '127.0.0.1', r));
      const port = probe.address().port;
      await new Promise((r) => probe.close(r));
      child = spawn(
        portable,
        [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, ...extra],
        { env, windowsHide: true, stdio: 'ignore' },
      );
      connection = await until(async () => {
        try {
          return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        } catch {}
      }, 'portable CDP');
      context = connection.contexts()[0];
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [root, `--test-profile=${profile}`, ...extra],
        env,
      });
      const errorFile = path.join(profile, 'main-error.txt');
      app
        .process()
        .stderr.on('data', (data) =>
          fs.appendFileSync(path.join(profile, 'electron.log'), String(data)),
        );
      await app.evaluate((_electron, errorFile) => {
        process.prependListener('uncaughtException', (error) => {
          process.getBuiltinModule('fs').writeFileSync(errorFile, error.stack || String(error));
          process.exit(1);
        });
      }, errorFile);
      context = app.context();
    }
    return until(
      () => context.pages().find((p) => p.url().startsWith('appdock://host/index.html')),
      'host',
    );
  }
  let host = await launch();
  host.on('pageerror', (error) => console.error('HOST-RENDERER-ERROR', error.message));
  async function close() {
    if (!app && !portable) return;
    if (app) {
      await app.close();
      app = undefined;
      if (fs.existsSync(path.join(profile, 'main-error.txt')))
        throw Error(fs.readFileSync(path.join(profile, 'main-error.txt'), 'utf8'));
    } else {
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null, 'portable shutdown');
      await connection.close();
    }
  }
  const settingsPage = () => require('./settings-host-helper.cjs').settingsPage(host);
  const provider = async (id) => {
    await host.evaluate(async (id) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          host: {
            ...s.settings.value.host,
            shellProviders: Object.fromEntries(
              [
                'ribbon',
                'overlay.command-palette',
                'page.home',
                'page.logs',
                'page.notifications',
                'page.settings',
                'notification.banner',
                'notification.desktop',
              ].map((region) => [region, id]),
            ),
          },
        },
        s.settings.revision,
      );
    }, id);
  };
  const modelOf = (p) =>
    p.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
  const providerPage = (id) =>
    until(async () => {
      const p = await settingsPage();
      try {
        if (!(await context.pages()).some((surface) => surface.url().endsWith('/settings.html')))
          return p;
      } catch {}
    }, `provider ${id}`);
  const checks = [];
  try {
    await until(
      () => host.evaluate(() => window.dock.snapshot().then((s) => s.startupReady)),
      'startup',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    let shell = await settingsPage();
    assert.equal((await modelOf(shell)).schemaVersion, 2);
    assert.equal((await modelOf(shell)).content.editing.dirty, undefined);
    assert.equal(
      await shell.getByRole('button', { name: '変更をすべて保存', exact: true }).count(),
      0,
    );
    assert.equal(JSON.stringify(await modelOf(shell)).includes('never-in-shell'), false);
    assert.equal(await shell.evaluate(() => typeof window.appdockPage), 'undefined');
    await require('./shell-page-layout-helper.cjs').exerciseLayout(host, shell, app, 'settings');
    await shell.getByLabel('テーマ', { exact: true }).selectOption('light');
    await settleSettings(shell);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.theme,
      'light',
    );
    checks.push(
      'schema 2 page-only public model, no global save or dirty state, immediate durable theme and native layout',
    );
    const category = async (name) => {
      await shell
        .locator('.settings-categories button')
        .filter({ has: shell.locator('span[title="' + name + '"]') })
        .click();
    };
    await category('プロフィール');
    await shell.getByLabel('ユーザー名', { exact: true }).fill('Immediate profile');
    await shell.getByLabel('ユーザー名', { exact: true }).press('Enter');
    await settleSettings(shell);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions['fixture.profile']
        .settings.name,
      'Immediate profile',
    );
    const name = shell.getByLabel('ユーザー名', { exact: true });
    await name.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '変換確定');
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, isComposing: true, data: '変換確定' }),
      );
    });
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.profile'
      ].settings.name,
      'Immediate profile',
    );
    await name.evaluate((el) =>
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '変換確定' })),
    );
    await name.press('Enter');
    await settleSettings(shell);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.profile'
      ].settings.name,
      '変換確定',
    );
    // Rapid confirmed events must serialize without losing a newer character.
    await name.fill('');
    await name.pressSequentially('Rapid typing');
    await name.press('Enter');
    await settleSettings(shell);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.profile'
      ].settings.name,
      'Rapid typing',
    );
    checks.push('Applet text and rapid typing persist on Enter; IME remains local until confirmed');
    if (app) {
      await app.evaluate(() => {
        const r = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')(
          './out/main/main/core/settings',
        );
        globalThis.immediateSaveFixture = {
          original: r.SettingsStore.prototype.save,
          prototype: r.SettingsStore.prototype,
        };
        r.SettingsStore.prototype.save = function () {
          throw Error('synthetic disk save failure');
        };
      });
      await name.fill('Rejected input');
      await name.press('Enter');
      await shell.getByRole('alert').first().waitFor();
      assert.equal(await name.inputValue(), 'Rejected input');
      assert.equal(
        (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
          'fixture.profile'
        ].settings.name,
        'Rapid typing',
      );
      await app.evaluate(() => {
        globalThis.immediateSaveFixture.prototype.save = globalThis.immediateSaveFixture.original;
        delete globalThis.immediateSaveFixture;
      });
      await name.fill('Retry confirmed');
      await name.press('Enter');
      await settleSettings(shell);
      assert.equal(
        (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
          'fixture.profile'
        ].settings.name,
        'Retry confirmed',
      );
      checks.push(
        'save-failure fixture preserves local input and durable value; explicit corrected input saves after recovery',
      );
    }
    await category('Settings fixture');
    await shell.getByLabel('Fixture amount', { exact: true }).fill('-');
    await shell.getByLabel('Fixture amount', { exact: true }).press('Enter');
    await shell.getByRole('alert').first().waitFor();
    assert.equal(await shell.getByLabel('Fixture amount', { exact: true }).inputValue(), '-');
    assert.notEqual(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.settings'
      ]?.settings.amount,
      '-',
    );
    await shell.getByLabel('Fixture amount', { exact: true }).fill('9');
    await shell.getByLabel('Fixture amount', { exact: true }).press('Enter');
    await settleSettings(shell);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.settings'
      ].settings.amount,
      9,
    );
    await shell.getByLabel('Fixture text', { exact: true }).fill('Shared durable text');
    await shell.getByLabel('Fixture text', { exact: true }).press('Enter');
    await settleSettings(shell);
    await shell.getByRole('button', { name: 'JSON', exact: true }).click();
    await shell.getByLabel('設定JSON').fill('{invalid');
    await shell.getByLabel('設定JSON').press('Enter');
    await shell.getByRole('alert').first().waitFor();
    assert.equal('text' in (await host.evaluate(() => window.dock.settingsEditing())), false);
    await category('表示');
    await category('Settings fixture');
    assert.equal(
      await shell.getByLabel('Fixture text', { exact: true }).inputValue(),
      'Shared durable text',
    );
    await shell.getByRole('button', { name: 'JSON', exact: true }).click();
    const before = JSON.parse(await shell.getByLabel('設定JSON').inputValue());
    before.extensions['fixture.settings'].settings.amount = 11;
    await shell.getByLabel('設定JSON').fill(JSON.stringify(before));
    await shell.getByLabel('設定JSON').press('Enter');
    await settleSettings(shell);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.settings'
      ].settings.amount,
      11,
    );
    await shell.getByRole('button', { name: 'フォーム', exact: true }).click();
    checks.push(
      'incomplete numbers/JSON never enter main state; correction and valid scoped JSON save, leaving the page drops local incomplete input',
    );
    await provider('fixture.settings-shell');
    shell = await providerPage('fixture.settings-shell');
    assert.equal(
      await shell.getByLabel('Fixture text', { exact: true }).inputValue(),
      'Shared durable text',
    );
    // A stale page projection cannot overwrite an externally changed field.
    const stale = await modelOf(shell);
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      const v = structuredClone(s.settings.value);
      v.extensions['fixture.settings'].settings.amount = 12;
      await window.dock.saveSettings(v, s.settings.revision);
    });
    const rejected = await shell.evaluate(async (old) => {
      const m = await window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      );
      const next = structuredClone(old.content.values);
      next.extensions['fixture.settings'].settings.amount = 13;
      try {
        await window.dock.settingsPage.act(
          document.querySelector('.settings-surface').dataset.settingsConnection,
          {
            id: m.id,
            type: 'settings',
            sessionId: m.content.editing.sessionId,
            editRevision: m.content.editing.editRevision,
            operationId: crypto.randomUUID(),
            operation: {
              kind: 'edit',
              action: {
                type: 'page-values',
                pageId: m.content.page.id,
                before: old.content.values,
                value: next,
              },
            },
          },
        );
        return false;
      } catch {
        return true;
      }
    }, stale);
    assert.equal(rejected, true);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.settings'
      ].settings.amount,
      12,
    );
    checks.push(
      'legacy assignments retain host settings values; stale same-field edit cannot overwrite an external update',
    );
    assert.equal(
      context.pages().some((p) => p.url().endsWith('/settings.html')),
      false,
    );
    checks.push('settings remain in the host document; legacy Shell HTML is never loaded');
    await provider('fixture.old-settings');
    shell = await providerPage('appdock.default-shell');
    await until(
      async () => (await shell.getByLabel('Fixture amount', { exact: true }).inputValue()) === '12',
      'external value reflected in host controls',
    );
    assert.equal(await shell.getByLabel('Fixture amount', { exact: true }).inputValue(), '12');
    checks.push('pre-0.33 settings provider keeps host controls without loading legacy HTML');
    await provider('fixture.stalled-settings');
    shell = await providerPage('appdock.default-shell');
    assert.equal(await shell.getByLabel('Fixture amount', { exact: true }).inputValue(), '12');
    if (app) {
      await category('プロフィール');
      await app.evaluate(() => {
        const { SettingsInputSession } = process
          .getBuiltinModule('module')
          .createRequire(process.cwd() + '/package.json')(
          './out/main/main/core/settings-input-session',
        );
        const prototype = SettingsInputSession.prototype;
        const original = prototype.act;
        globalThis.settingsDrainFixture = { prototype, original };
        prototype.act = function (request) {
          if (
            request.action?.type === 'page-values' &&
            request.action.value?.extensions?.['fixture.profile']?.settings?.name === 'Drain proof'
          )
            return new Promise((resolve) => {
              globalThis.settingsDrainFixture.release = resolve;
            }).then(() => original.call(this, request));
          return original.call(this, request);
        };
      });
      try {
        await shell.getByLabel('ユーザー名', { exact: true }).fill('Drain proof');
        await shell.getByLabel('ユーザー名', { exact: true }).press('Enter');
        await until(
          () => app.evaluate(() => !!globalThis.settingsDrainFixture.release),
          'queued host settings edit',
        );
        const navigating = host.evaluate(() => window.dock.navigate('home'));
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          (await host.evaluate(() => window.dock.snapshot())).navigation.route,
          'settings',
        );
        await app.evaluate(() => {
          globalThis.settingsDrainFixture.release();
        });
        await navigating;
        assert.equal(
          (await host.evaluate(() => window.dock.snapshot())).settings.value.extensions[
            'fixture.profile'
          ].settings.name,
          'Drain proof',
        );
        checks.push(
          'navigation waits for the settings form queue before disposing the host surface',
        );
      } finally {
        await app.evaluate(() => {
          const fixture = globalThis.settingsDrainFixture;
          fixture.release?.();
          fixture.prototype.act = fixture.original;
          delete globalThis.settingsDrainFixture;
        });
      }
    }
    await host.evaluate(() => window.dock.navigate('home'));
    const state = await host.evaluate(() => window.dock.settingsEditing());
    for (const key of ['draft', 'dirty', 'buffers', 'text', 'avatarChanged', 'saveError'])
      assert.equal(key in state, false);
    assert.equal(
      context.pages().some((p) => p.url().endsWith('/settings.html')),
      false,
    );
    checks.push(
      'no global draft, partial buffer, staged avatar or unsaved banner survives navigation',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    await settingsPage();
    await host.waitForFunction(
      () => localStorage.getItem('appdock.restart-view.page') === '"settings"',
    );
    await close();
    host = await launch(['--safe-shell', '--restore-view']);
    await until(
      () => host.evaluate(() => window.dock.snapshot().then((s) => s.startupReady)),
      'restart',
    );
    shell = await providerPage('appdock.default-shell');
    assert.equal((await modelOf(shell)).content.context, 'full');
    assert.equal(await host.getByText(/設定を読み込んでいます…Error:/).count(), 0);
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    assert.equal(saved.extensions['fixture.settings'].settings.amount, 12);
    assert.equal(
      saved.extensions['fixture.profile'].settings.name,
      portable ? 'Rapid typing' : 'Drain proof',
    );
    assert.equal(saved.extensions['missing.applet'].settings.private, 'never-in-shell');
    checks.push(
      'restored full settings renders without navigation, including safe Shell; immediate settings/assets and unrelated private values persist',
    );
    await host.evaluate(() => window.dock.navigate('extensions'));
    await host
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /^Settings fixture/ })
      .click();
    await host.getByRole('tab', { name: '設定', exact: true }).click();
    await settingsPage();
    await host.waitForFunction(
      () =>
        localStorage.getItem('appdock.restart-view.page') === '"extensions"' &&
        localStorage.getItem('appdock.restart-view.selected') === '"fixture.settings"',
    );
    await close();
    host = await launch(['--restore-view']);
    shell = await settingsPage();
    assert.equal((await modelOf(shell)).content.context, 'applet');
    assert.equal(await shell.getByLabel('Fixture amount', { exact: true }).inputValue(), '12');
    await shell.getByLabel('Fixture text', { exact: true }).fill('Restored detail');
    await shell.getByLabel('Fixture text', { exact: true }).press('Enter');
    await settleSettings(shell);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions[
        'fixture.settings'
      ].settings['text.value'],
      'Restored detail',
    );
    checks.push('restored Applet settings renders and saves without switching pages');
    const result = {
      success: true,
      profile,
      checks,
      mode: portable ? 'portable' : 'source',
      sha256: portable ? hash(portable) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      'HOST-SETTINGS-DIAGNOSTIC',
      await host
        .evaluate(async () => ({
          navigation: (await window.dock.snapshot()).navigation,
          rememberedPage: localStorage.getItem('appdock.restart-view.page'),
          surface: document.querySelector('.settings-surface')?.className,
          headings: [...document.querySelectorAll('h1')].map((element) => element.textContent),
          body: document.body.innerText.slice(0, 500),
        }))
        .catch(() => null),
    );
    throw error;
  } finally {
    if (app)
      await app
        .evaluate(() => {
          if (globalThis.immediateSaveFixture)
            globalThis.immediateSaveFixture.prototype.save =
              globalThis.immediateSaveFixture.original;
        })
        .catch(() => {});
    await close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
