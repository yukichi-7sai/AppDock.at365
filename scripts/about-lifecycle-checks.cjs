const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

module.exports = async function checkAboutLifecycle({ app, page, profile, checks, errors, until }) {
  const initial = await app.evaluate(() => ({ pid: process.pid, args: process.argv }));
  const port = initial.args.find((arg) => arg.startsWith('--remote-debugging-port=')).split('=')[1];
  const before = await page.evaluate(() => window.dock.snapshot());
  const events = () =>
    fs
      .readFileSync(path.join(profile, 'extensions/a/lifecycle.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  const running = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  };
  let browser;
  let restartedPid;
  try {
    const restart = page.getByTestId('about-restart');
    assert.equal(await restart.innerText(), '再起動');
    assert.equal(
      await page.getByTestId('about-quit').getAttribute('title'),
      'AppDockと実行中のAppletを終了します。',
    );
    await restart.focus();
    await restart.press('Enter');
    await until(async () => {
      try {
        const pid = await app.evaluate(() => process.pid);
        if (pid !== initial.pid) {
          restartedPid = pid;
          return true;
        }
      } catch {}
      return false;
    }, 'About restart launches a new host process');
    await until(() => !running(initial.pid), 'original host exits');
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'reconnect to restarted host');
    let restored;
    await until(async () => {
      restored = browser
        .contexts()[0]
        .pages()
        .find((candidate) => candidate.url().startsWith('appdock://host/'));
      const snapshot = restored && (await restored.evaluate(() => window.dock?.snapshot()));
      return (
        snapshot?.startupReady &&
        snapshot.extensions.some(
          (item) => item.id === 'fixture.about.a' && item.state === 'running',
        )
      );
    }, 'restarted host and enabled Applet are ready');
    restored.on('pageerror', (error) => errors.push(error.message));
    await restored.getByTestId('about-overview').waitFor();
    const after = await restored.evaluate(() => window.dock.snapshot());
    assert.deepEqual(after.settings.value.extensions, before.settings.value.extensions);
    assert.deepEqual(after.settings.value.customCommands, before.settings.value.customCommands);
    assert(after.extensions.some((item) => item.id === 'fixture.about.b' && !item.enabled));
    assert.deepEqual(
      events().map((item) => item.event),
      ['start', 'stop', 'start'],
    );
    assert.notEqual(events()[0].pid, events()[2].pid);
    await restored.screenshot({ path: path.join(profile, 'after-about-restart.png') });
    checks.push(
      'About restart responds to Enter, exits the original host, restores About and restarts only enabled Applets without changing their settings',
    );
    await restored.getByTestId('about-quit').scrollIntoViewIfNeeded();
    await restored.screenshot({ path: path.join(profile, 'about-quit-visible.png') });
    await restored.getByTestId('about-quit').click();
    await until(() => !running(restartedPid), 'About quit exits the restarted host');
    assert.deepEqual(
      events().map((item) => item.event),
      ['start', 'stop', 'start', 'stop'],
    );
    await until(
      () => events().every((item) => !running(item.pid)),
      'fixture Applet processes exit',
    );
    checks.push('About quit click exits the host and cleanly deactivates the running Applet');
  } finally {
    if (restartedPid && running(restartedPid)) {
      await app
        .evaluate(({ app }) => {
          setTimeout(() => app.quit(), 100);
        })
        .catch(() => {});
      await until(() => !running(restartedPid), 'restarted test host cleanup');
    }
    await browser?.close();
  }
};
