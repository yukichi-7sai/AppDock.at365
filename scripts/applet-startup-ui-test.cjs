const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `applet-startup-ui-${Date.now()}`);
const source = process.argv[2] && path.resolve(process.argv[2]);
const saveStress = process.argv.includes('--save-stress');
const checks = [],
  errors = [],
  measurements = {};
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mainWindow = `${electronExpression}.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/'))`;

async function until(fn, name, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(name);
}
function fixture(
  profile,
  settings,
  id,
  { enabled = true, delay = 0, wait = 0, fail = false } = {},
) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      startupDelaySeconds: delay,
    }),
  );
  fs.writeFileSync(path.join(folder, 'wait.txt'), String(wait));
  fs.writeFileSync(
    path.join(folder, 'index.cjs'),
    `
    exports.activate = async () => {
      await new Promise(resolve => setTimeout(resolve, Number(require('node:fs').readFileSync(require('node:path').join(__dirname, 'wait.txt'), 'utf8'))));
      ${fail ? "throw Error('fixture startup failure');" : ''}
    };
  `,
  );
  settings.extensions[id] = { enabled, settings: {} };
}

async function phase(name) {
  const profile = path.join(output, name);
  fs.mkdirSync(profile, { recursive: true });
  const settings = createDefaultSettings();
  Object.assign(settings.host, {
    soundEnabled: false,
    notifications: false,
    hardwareAcceleration: false,
    closeToTray: false,
    theme: 'light',
  });
  settings.gestures.enabled = false;
  settings.touchpadGestures.enabled = false;
  settings.keybindings = [];
  settings.globalShortcutCommands = [];
  settings.updates.checkHostOnAboutOpen = false;
  if (name === 'timing') {
    fixture(profile, settings, 'test.slow', { wait: 1200 });
    fixture(profile, settings, 'test.disabled', { enabled: false });
    fixture(profile, settings, 'test.delayed', { delay: 60, wait: 100 });
    fixture(profile, settings, 'test.failed', { wait: 25, fail: true });
  }
  fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
  const executable = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
  if (source) {
    require('./copy-host.cjs').copyHost(source, executable);
    assert.equal(hash(executable), hash(source));
  }
  const port = await freePort(),
    inspector = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      ...(!source ? [root] : []),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
      `--inspect=${inspector}`,
    ],
    { cwd: root, env, windowsHide: false, stdio: 'ignore' },
  );
  child.on('error', (error) => errors.push(error.message));
  let browser, page;
  const snapshot = () => page.evaluate(() => window.dock.snapshot());
  const row = (id) => page.locator(`[data-applet-id="${id}"]`);
  const capture = (file) =>
    inspect(
      inspector,
      `${mainWindow}.webContents.capturePage().then(image => { process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.join(profile, file))}, image.toPNG()); return image.getSize(); })`,
    );
  const checkTiming = async (id) => {
    const a = (await snapshot()).extensions.find((a) => a.id === id);
    assert(Number.isFinite(a.startupTiming?.durationMs));
    const duration = a.startupTiming.durationMs;
    const text =
      duration < 1000 ? `${Math.round(duration)} ms` : `${(duration / 1000).toFixed(2)} 秒`;
    assert((await row(id).getByTestId('applet-startup-time').innerText()).startsWith(text));
    assert(Array.isArray(a.startupTiming.phases));
    const sum = a.startupTiming.phases.reduce((sum, phase) => sum + phase.durationMs, 0);
    assert(Math.abs(sum - duration) < 0.001);
    const title = await row(id).getByTestId('applet-startup-time').getAttribute('title');
    assert(title.startsWith('合計：'));
    for (const [phase, label] of Object.entries({
      prepare: 'ホストの開始準備',
      process: 'プロセスの起動要求',
      activate: '接続・初期化の応答待ち',
      validate: '登録内容の確認',
    })) {
      if (a.startupTiming.phases.some((item) => item.phase === phase))
        assert(title.includes(label));
    }
    assert(title.includes('ホスト処理の待ち時間'));
    if (a.startupTiming.outcome === 'error') assert(title.includes('失敗した区間まで'));
    await row(id).getByTestId('applet-startup-time').hover();
    return a.startupTiming;
  };
  const empty = async (title) => {
    const element = page.getByTestId('applet-management-empty');
    await element.waitFor();
    assert.equal(await element.locator('strong').innerText(), title);
    assert.equal(await element.locator('td').getAttribute('colspan'), '7');
    assert.equal(await element.locator('xpath=..').evaluate((e) => e.tagName), 'TBODY');
    assert.equal(await page.locator('.applet-management-table thead th').count(), 7);
    assert.equal(
      await page.getByRole('button', { name: 'Appletをインストール', exact: true }).isEnabled(),
      Boolean(source),
    );
  };
  try {
    browser = await until(
      async () => {
        try {
          return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        } catch {
          return false;
        }
      },
      'CDP connection',
      60000,
    );
    page = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host renderer',
    );
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => errors.push(error.message));
    await waitForHost(
      page,
      async () => (await window.dock.snapshot()).startupReady,
      undefined,
      60000,
    );
    measurements.version = (await snapshot()).version;
    await inspect(inspector, `${mainWindow}.setSize(1280, 850); ${mainWindow}.show(); true`);
    await page.evaluate(() => window.dock.executeCommand('appdock.applets.open'));
    await page.getByRole('heading', { name: 'Applet管理', exact: true }).waitFor();
    if (name === 'timing') {
      measurements.first = await checkTiming('test.slow');
      assert(measurements.first.durationMs >= 1200);
      for (const id of ['test.disabled', 'test.delayed'])
        assert.equal(await row(id).getByTestId('applet-startup-time').innerText(), '—');
      measurements.failed = await checkTiming('test.failed');
      assert.equal(measurements.failed.outcome, 'error');
      assert(
        (await row('test.failed').getByTestId('applet-startup-time').innerText()).includes(
          '起動失敗',
        ),
      );
      checks.push('actual-activation-duration-disabled-and-waiting-unmeasured-failure-labelled');
      checks.push('startup-tooltip-phase-sum-localized-labels-and-partial-failure');
      if (saveStress) {
        await page.evaluate(() => {
          window.__saveStressErrors = [];
          window.__saveStressOff = window.dock.onChanged(async () => {
            const state = await window.dock.snapshot();
            if (state.settings.syncError) window.__saveStressErrors.push(state.settings.syncError);
          });
        });
        for (let i = 0; i < 60; i++) {
          const enabled = i % 2 === 0;
          await row('test.disabled').getByRole('switch').click();
          await waitForHost(
            page,
            async ({ id, enabled }) => {
              const state = await window.dock.snapshot();
              const applet = state.extensions.find((a) => a.id === id);
              return (
                applet.enabled === enabled && applet.state === (enabled ? 'running' : 'stopped')
              );
            },
            { id: 'test.disabled', enabled },
          );
          const state = await snapshot();
          assert.equal(state.settings.syncError, undefined);
          const saved = JSON.parse(
            fs.readFileSync(
              require('./test-settings.cjs').file(profile, `settings-${require('node:os').hostname()}.json`),
              'utf8',
            ),
          );
          assert.equal(saved.extensions['test.disabled'].enabled, enabled);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        const failures = await page.evaluate(() => {
          window.__saveStressOff();
          return window.__saveStressErrors;
        });
        assert.deepEqual(failures, []);
        const saveLog = fs.readFileSync(
          path.join(profile, 'data', 'logs', require('node:os').hostname(), 'host.log'),
          'utf8',
        );
        assert(!/save-failed|EPERM[^\n]*rename/.test(saveLog));
        measurements.saveStress = { toggles: 60, failures };
        checks.push('rapid-applet-toggles-persist-without-transient-save-errors');
      }
      fs.writeFileSync(path.join(profile, 'extensions/test.slow/wait.txt'), '2000');
      await row('test.slow')
        .getByRole('button', { name: 'test.slowを再起動', exact: true })
        .click();
      await row('test.slow')
        .getByTestId('applet-startup-time')
        .getByText('計測中…', { exact: true })
        .waitFor();
      await waitForHost(
        page,
        async () =>
          (await window.dock.snapshot()).extensions.find((a) => a.id === 'test.slow').state ===
          'running',
      );
      measurements.restarted = await checkTiming('test.slow');
      assert(measurements.restarted.durationMs >= 2000);
      assert.notEqual(measurements.restarted.durationMs, measurements.first.durationMs);
      checks.push('restart-shows-measuring-and-replaces-duration');
      await row('test.delayed').getByRole('button', { name: '今すぐ開始', exact: true }).click();
      await waitForHost(
        page,
        async () =>
          (await window.dock.snapshot()).extensions.find((a) => a.id === 'test.delayed').state ===
          'running',
      );
      measurements.delayed = await checkTiming('test.delayed');
      assert(measurements.delayed.durationMs < 60000);
      checks.push('start-now-excludes-configured-delay');
      await capture('timing-light.png');
      const search = page.getByRole('searchbox', { name: 'Appletを検索', exact: true });
      await search.fill('no-such-applet');
      await empty('該当するAppletはありません。');
      assert.equal(await page.locator('[data-applet-id]').count(), 0);
      await search.fill('');
      await row('test.slow').waitFor();
      checks.push('filtered-empty-row-spans-all-columns-and-clears');
    } else {
      await empty('Appletを追加しましょう');
      assert.equal(await page.locator('[data-applet-id]').count(), 0);
      assert(
        (await page.getByTestId('applet-management-empty').locator('p').innerText()).includes('＋'),
      );
      await capture('empty-light.png');
      checks.push('no-installed-applets-has-in-table-add-guidance');
      await page
        .locator('.settings-categories button')
        .filter({ has: page.locator('span[title="AI"]') })
        .click();
      await page.getByText('AIサーバーを追加しましょう', { exact: true }).waitFor();
      assert.equal(
        await page
          .getByText('AIサーバーを追加しましょう', { exact: true })
          .evaluate((e) => e.closest('td').colSpan),
        3,
      );
      await capture('ai-empty-light.png');
      checks.push('ai-empty-keeps-common-table-row');
      await page
        .locator('.settings-categories button')
        .filter({ has: page.locator('span[title="Applet管理"]') })
        .click();
      await empty('Appletを追加しましょう');
    }
    await page.evaluate(async () => {
      const { settings } = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...settings.value, host: { ...settings.value.host, theme: 'dark' } },
        settings.revision,
      );
    });
    await waitForHost(page, async () => (await window.dock.snapshot()).dark);
    await capture(`${name}-dark.png`);
    await inspect(inspector, `${mainWindow}.setSize(800, 700); true`);
    const size = await capture(`${name}-narrow.png`);
    assert(size.width >= 640 && size.height >= 480);
    assert.equal(
      await page
        .locator('.applet-management-table')
        .evaluate(
          (table) =>
            table.closest('.settings-list-scroll').scrollWidth >=
            table.closest('.settings-list-scroll').clientWidth,
        ),
      true,
    );
    assert(!fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8').includes('startupTiming'));
    checks.push(`${name}-themes-narrow-width-and-no-persisted-timing`);
  } catch (error) {
    if (page) {
      await capture('failure.png').catch(() => {});
      fs.writeFileSync(
        path.join(profile, 'failure.txt'),
        await page
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    throw error;
  } finally {
    if (page)
      await page
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    try {
      await until(() => child.exitCode !== null, 'test host shutdown', 10000);
    } finally {
      if (child.exitCode === null) child.kill();
      if (browser) await browser.close();
    }
  }
}

(async () => {
  const result = { ok: false, output, source, checks, errors, measurements };
  try {
    await phase('timing');
    await phase('empty');
    assert.deepEqual(errors, []);
    result.ok = true;
    if (source) result.sha256 = hash(source);
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})();
