const { getPublishDirectory } = require('./publish-paths.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { WindowsLaunch, runPowerShell, psString } = require('../out/main/main/core/windows-launch');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `launch-settings-${Date.now()}`);
const folder = path.join(profile, '日本語 folder');
fs.mkdirSync(folder, { recursive: true });
const executable = path.join(folder, "AppDock's.at365.exe");
const source = path.resolve(
  process.argv[2] || path.join(getPublishDirectory(root), 'AppDock.at365.exe'),
);
fs.copyFileSync(source, executable);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(source), hash(executable));
const settings = createDefaultSettings();
settings.host.notifications = false;
settings.host.hardwareAcceleration = false;
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const service = new WindowsLaunch(executable, profile, [`--test-profile=${profile}`]);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [];
let child, browser, page;
async function until(fn, message) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
}
async function launch() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(executable, [`--test-profile=${profile}`, `--remote-debugging-port=${port}`], {
    cwd: folder,
    windowsHide: true,
    env,
    stdio: 'ignore',
  });
  browser = await until(async () => {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
    } catch {
      return false;
    }
  }, 'CDP startup');
  page = await until(
    () =>
      browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith('appdock://host')),
    'host page',
  );
  await require('./shell-overlay-helper.cjs').startupPage(page);
  await until(
    () => page.evaluate(async () => (await window.dock.snapshot()).startupReady),
    'host ready',
  );
  page = require('./settings-aware-page.cjs').settingsAwarePage(page);
  page.setDefaultTimeout(12000);
  await page.locator('[data-ribbon-id="settings"]').click();
  await category('一般').click();
}
const button = (name) => page.getByRole('button', { name, exact: true });
const category = (name) =>
  page
    .locator('.settings-categories button')
    .filter({ has: page.locator(`span[title="${name}"]`) });
const toggle = (name) => page.getByRole('switch', { name, exact: true });
const snapshot = () => page.evaluate(() => window.dock.snapshot());
async function save() {
  await settleSettings(page);
}
async function close() {
  await page
    .evaluate(() => {
      void window.dock.executeCommand('appdock.quit');
    })
    .catch(() => {});
  await until(() => child.exitCode !== null, 'host shutdown');
  await browser.close();
  browser = null;
}
(async () => {
  let result;
  try {
    await launch();
    const initial = await snapshot();
    assert.equal(initial.launch.supported, true);
    assert.equal(initial.launch.registered, false);
    assert.equal(await toggle('スタートアップに登録').getAttribute('aria-checked'), 'false');
    assert.equal(await toggle('常に管理者として起動').getAttribute('aria-checked'), 'false');
    await toggle('スタートアップに登録').click();
    await save();
    assert.equal((await service.read()).registered, true);
    await toggle('閉じるとトレイに収納').click();
    await category('リボン').click();
    await category('一般').click();
    assert.equal(await toggle('スタートアップに登録').getAttribute('aria-checked'), 'true');
    await save();
    const registered = await service.read();
    assert.equal(await button('管理者として再起動').isDisabled(), registered.elevated);
    assert.equal(registered.registered, true);
    assert.equal(registered.taskElevated, false);
    assert.equal((await snapshot()).settings.value.host.closeToTray, false);
    const xml = registered.xml;
    fs.writeFileSync(path.join(profile, 'registered-task.xml'), xml);
    for (const text of [
      '<LogonTrigger>',
      '<Delay>PT3S</Delay>',
      '<LogonType>InteractiveToken</LogonType>',
      '<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
      '<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    ])
      assert.ok(xml.includes(text), text);
    checks.push(
      'immediate setting registers exact portable path, interactive logon and limited privileges',
    );
    // Task Scheduler actually runs the published EXE; the running instance receives activation.
    await runPowerShell(
      `$s=New-Object -ComObject Schedule.Service; $s.Connect(); $null=$s.GetFolder('\\').GetTask(${psString(service.state.taskName)}).Run($null)`,
    );
    await until(
      async () =>
        (await runPowerShell(
          `$s=New-Object -ComObject Schedule.Service; $s.Connect(); $t=$s.GetFolder('\\').GetTask(${psString(service.state.taskName)}); [Console]::Write($t.State)`,
        )) !== '4',
      'task duplicate exited',
    );
    assert.equal(
      await runPowerShell(
        `$s=New-Object -ComObject Schedule.Service; $s.Connect(); [Console]::Write($s.GetFolder('\\').GetTask(${psString(service.state.taskName)}).LastTaskResult)`,
      ),
      '0',
    );
    assert.equal((await snapshot()).startupReady, true);
    checks.push(
      'Windows Task Scheduler executes fixed EXE successfully; existing instance remains running',
    );
    if (!registered.administratorAccount && !registered.elevated) {
      await toggle('常に管理者として起動').click();
      await settleSettings(page);
      await page
        .getByText(/このWindowsユーザーは管理者ではありません/)
        .first()
        .waitFor();
      assert.equal((await snapshot()).settings.value.host.runAsAdministrator, false);
      assert.equal((await service.read()).taskElevated, false);
      assert.equal(await toggle('常に管理者として起動').getAttribute('aria-checked'), 'true');
      await toggle('常に管理者として起動').click();
      await save();
      checks.push(
        'standard-user elevation refusal preserves saved settings, registered task, and local rejected input',
      );
    }
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        async () => (await snapshot()).settings.value.host.theme === theme,
        'theme saved',
      );
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      for (const width of [1280, 900, 700]) {
        // CDP viewport exercises the renderer layout while keeping the native window stable.
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: path.join(profile, `${theme}-${width}.png`) });
        for (const name of [
          'スタートアップに登録',
          '常に管理者として起動',
          '状態を確認',
          '管理者として再起動',
        ])
          assert.equal(
            await page
              .getByRole(name.includes('登録') || name.includes('常に') ? 'switch' : 'button', {
                name,
                exact: true,
              })
              .isVisible(),
            true,
          );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${theme} ${width}: overflow`,
        );
      }
    }
    checks.push(
      'dark/light UI at 1280, 900 and 700px has visible controls and no horizontal overflow',
    );
    await close();
    await launch();
    assert.equal((await snapshot()).launch.registered, true);
    assert.equal(await toggle('スタートアップに登録').getAttribute('aria-checked'), 'true');
    await toggle('スタートアップに登録').click();
    await save();
    assert.equal((await service.read()).registered, false);
    await button('状態を確認').click();
    await page.getByText(/スタートアップ: 未登録/).waitFor();
    checks.push(
      'restart preserves settings and detects Windows registration; disabling and saving removes only isolated task',
    );
    if (registered.administratorAccount && !registered.elevated) {
      await toggle('常に管理者として起動').click();
      await save();
      assert.equal((await snapshot()).settings.value.host.runAsAdministrator, true);
      assert.equal((await snapshot()).launch.elevated, false);
      assert.equal((await service.read()).registered, false);
      await toggle('常に管理者として起動').click();
      await save();
      assert.equal((await snapshot()).settings.value.host.runAsAdministrator, false);
      checks.push(
        'filtered administrator can immediately enable and disable administrator preference without a startup task or changing the current token',
      );
    }
    if (!registered.administratorAccount && !registered.elevated) {
      await close();
      const stored = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
      stored.host.runAsAdministrator = true;
      fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(stored));
      await launch();
      const fallback = await snapshot();
      assert.equal(fallback.launch.elevated, false);
      assert.equal(fallback.settings.value.host.runAsAdministrator, true);
      assert.match(fallback.launch.error, /通常権限で動作/);
      await toggle('常に管理者として起動').click();
      await save();
      await button('状態を確認').click();
      assert.equal((await snapshot()).settings.value.host.runAsAdministrator, false);
      await until(
        async () => (await snapshot()).launch.error === undefined,
        'launch status refresh',
      );
      checks.push(
        'imported elevated preference cannot elevate a standard user; automatic startup continues normally with visible outcome and no restart loop',
      );
    }
    result = {
      ok: true,
      profile,
      sha256: hash(executable),
      version: (await snapshot()).version,
      checks,
      unverified: 'UAC acceptance/elevated token/real Windows sign-in',
    };
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      fs.writeFileSync(
        path.join(profile, 'failure.txt'),
        await page
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    result = { ok: false, profile, checks, error: error.stack };
    process.exitCode = 1;
  } finally {
    if (browser)
      await close().catch((error) => {
        process.exitCode = 1;
        result.cleanupError = error.message;
      });
    try {
      await service.read();
      if (service.state.registered)
        await service.save(
          settings.host,
          { ...settings.host, startAtLogon: true },
          () => {},
          () => {},
        );
      result.taskRemoved = !(await service.read()).registered;
    } catch (error) {
      result.cleanupError = error.message;
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
