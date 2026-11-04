const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, until } = require('./page-test-host.cjs');
const { ribbonPage, closingAction } = require('./shell-overlay-helper.cjs');
const { moveCursor } = require('./windows-mouse-helper.cjs');
const { file } = require('./test-settings.cjs');
const profile = path.resolve('.artifacts', `ribbon-hover-ui-${Date.now()}`);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, { closeToTray: false, hardwareAcceleration: false, zoomFactor: 1 });
Object.assign(settings.updates, {
  hostSource: '',
  checkHostOnAboutOpen: false,
  checkHostOnStartup: false,
  checkAppletsOnStartup: false,
});
settings.ribbon.groups = [
  {
    id: 'group:hover',
    title: 'Hover group',
    icon: 'folder',
    expansion: 'temporary',
    children: ['image-library', 'sound-library'],
  },
];
settings.ribbon.order = ['ribbon-display-mode', 'group:hover', 'settings'];
fs.writeFileSync(file(profile), JSON.stringify(settings));
const checks = [];
let host, rail, original;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function geometry() {
  return host.app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    const view = w.contentView.children.find((v) =>
      v.webContents?.getURL().endsWith('/renderer/workspace/index.html'),
    );
    const origin = w.getContentBounds(),
      b = view.getBounds();
    return {
      origin,
      bounds: b,
      scale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
      inside: screen.dipToScreenPoint({ x: origin.x + b.x + 25, y: origin.y + b.y + 90 }),
      left: screen.dipToScreenPoint({ x: origin.x - 35, y: origin.y + b.y + 90 }),
      body: screen.dipToScreenPoint({ x: origin.x + 450, y: origin.y + b.y + 90 }),
    };
  });
}
async function move(where) {
  const g = await geometry();
  const previous = moveCursor(g[where]);
  original ??= previous;
}
const state = () => host.main.evaluate(() => window.dock.snapshot());
async function mode(expected) {
  await until(async () => (await state()).ribbonDisplayMode === expected, `mode ${expected}`);
  await until(async () => {
    const g = await geometry();
    return (
      Math.abs(
        g.bounds.width -
          (expected === 'expanded' ? 200 : 56) * (await state()).settings.value.host.zoomFactor,
      ) <= 1
    );
  }, `native width ${expected}`);
}
async function openSettings() {
  await host.main.evaluate(() => window.dock.executeCommand('appdock.ribbon.settings.open'));
  const toggle = host.main.getByRole('switch', {
    name: 'カーソルホバー時に大きくする',
    exact: true,
  });
  await toggle.waitFor();
  return toggle;
}
async function start() {
  host = await launch(profile, portable);
  rail = await ribbonPage(host.main);
  await host.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    w.setBounds({ x: 200, y: 100, width: 1000, height: 700 });
    w.show();
    w.focus();
  });
}
(async () => {
  try {
    await start();
    await move('body');
    await mode('compact');
    await rail.locator('[data-ribbon-id="ribbon-display-mode"]').click();
    await mode('expanded');
    let toggle = await openSettings();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await toggle.click();
    await mode('compact');
    const before = fs.readFileSync(
      file(profile, `settings-${require('node:os').hostname()}.json`),
      'utf8',
    );
    await move('inside');
    await mode('expanded');
    await move('left');
    await mode('compact');
    assert.equal(
      fs.readFileSync(file(profile, `settings-${require('node:os').hostname()}.json`), 'utf8'),
      before,
      'hover never saves UI state',
    );
    checks.push(
      'default OFF, GUI toggle, native cursor enters and exits directly through left window edge, actual View widths, no UI-state writes',
    );
    await move('body');
    await toggle.click();
    await mode('expanded');
    assert.equal((await state()).settings.value.host.ribbonExpandOnHover, false);
    await toggle.click();
    await mode('compact');
    await move('inside');
    await mode('expanded');
    await rail.locator('[data-ribbon-id="ribbon-display-mode"]').click();
    await mode('compact');
    assert.equal((await state()).settings.value.host.ribbonExpandOnHover, false);
    await move('body');
    await move('inside');
    await delay(1100);
    await mode('compact');
    checks.push(
      'OFF restores remembered expanded mode; manual button disables automatic mode and preserves manual compact mode across later hover',
    );
    await move('body');
    toggle = await openSettings();
    await toggle.click();
    await mode('compact');
    await move('inside');
    await mode('expanded');
    await rail.locator('[data-ribbon-id="group:hover"]').click();
    const group = await until(
      () =>
        host.app
          .context()
          .pages()
          .find(
            (p) =>
              p !== rail && p.url().endsWith('/renderer/workspace/index.html') && !p.isClosed(),
          ),
      'group surface',
    );
    await group.getByRole('dialog', { name: 'Hover group', exact: true }).waitFor();
    await delay(1200);
    await mode('expanded');
    await closingAction(group.locator('[data-ribbon-id="image-library"]').click());
    await until(async () => !(await state()).overlay.active, 'group selection closes');
    checks.push(
      'temporary group stays expanded through native surface transition and remains operable',
    );
    await move('body');
    await mode('compact');
    await rail.locator('[data-ribbon-id="group:hover"]').focus();
    await rail.locator('[data-ribbon-id="group:hover"]').press('Enter');
    const keyboardGroup = await until(
      () =>
        host.app
          .context()
          .pages()
          .find(
            (p) =>
              p !== rail && p.url().endsWith('/renderer/workspace/index.html') && !p.isClosed(),
          ),
      'keyboard group',
    );
    await keyboardGroup.getByRole('dialog', { name: 'Hover group', exact: true }).waitFor();
    await move('inside');
    await delay(1100);
    await mode('compact');
    assert.equal((await state()).overlay.kind, 'ribbon-group');
    await closingAction(keyboardGroup.getByRole('dialog').press('Escape'));
    await until(async () => !(await state()).overlay.active, 'keyboard group dismissal');
    await move('body');
    await mode('compact');
    checks.push('keyboard-opened compact group keeps its anchor when the cursor enters');
    await host.save({ host: { zoomFactor: 1.25 } });
    await move('inside');
    await mode('expanded');
    await move('left');
    await mode('compact');
    await host.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      w.setPosition(260, 140);
    });
    await move('inside');
    await mode('expanded');
    await move('left');
    await mode('compact');
    await host.save({ host: { zoomFactor: 1 } });
    checks.push('current native bounds follow window movement and 125 percent application zoom');
    await move('inside');
    await mode('expanded');
    await host.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .hide(),
    );
    await until(
      async () => (await state()).ribbonDisplayMode === 'compact',
      'hidden auto state cleared',
    );
    await move('left');
    await host.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      w.show();
      w.focus();
    });
    await mode('compact');
    checks.push('hide clears automatic expansion and show outside ribbon stays compact');
    toggle = await openSettings();
    await host.resize(1720, 1000);
    await host.main.screenshot({ path: path.join(profile, 'settings-wide.png') });
    await host.resize(900, 620);
    await host.save({ host: { theme: 'dark' } });
    await toggle.scrollIntoViewIfNeeded();
    await host.main.screenshot({ path: path.join(profile, 'settings-narrow-dark.png') });
    await host.close();
    host = undefined;
    await start();
    await move('body');
    await mode('compact');
    assert.equal((await state()).settings.value.host.ribbonExpandOnHover, true);
    await move('inside');
    await mode('expanded');
    await move('body');
    await mode('compact');
    toggle = await openSettings();
    await toggle.click();
    await mode('compact');
    checks.push(
      'setting survives restart; disabling restores remembered compact mode; wide/light and narrow/dark settings captured',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { checks, geometry: await geometry(), version: (await state()).version, hash: host.hash },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host)
      await host.main.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    throw error;
  } finally {
    if (original) moveCursor(original);
    if (host) await host.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
