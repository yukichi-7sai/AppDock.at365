const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, until } = require('./page-test-host.cjs');
const { ribbonPage, overlayPage, closingAction } = require('./shell-overlay-helper.cjs');
const { barPage } = require('./shell-bars-helper.cjs');
const { moveCursor, leftDrag } = require('./windows-mouse-helper.cjs');
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
const fixture = path.join(profile, 'extensions', 'hover-page');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.hover',
    name: 'Hover page',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['pages'],
    commands: ['main', 'other'].map((id) => ({
      id: `fixture.hover.${id}`,
      title: id,
      activateOnExecute: true,
    })),
    pages: ['main', 'other'].map((id) => ({
      id,
      title: id,
      source: 'local',
      ui: `hover-page-${id}.html`,
      openCommand: `fixture.hover.${id}`,
    })),
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `exports.activate = async c => {
  for (const id of ['main', 'other']) c.commands.register('fixture.hover.' + id, id, () => c.pages.open(id));
};`,
);
for (const id of ['main', 'other'])
  fs.writeFileSync(
    path.join(fixture, `hover-page-${id}.html`),
    `<!doctype html>
  <title>Hover page ${id}</title><style>body { margin: 0; min-height: 2400px; background: #b8d9ed; }</style>
  <button style="position:fixed;inset:0;width:100%;height:100%">Underlying page</button>
  <script>window.clicks=0;window.resizes=0;window.instance=Date.now();
  addEventListener('click',()=>window.clicks++);addEventListener('resize',()=>window.resizes++);</script>`,
  );
settings.extensions['fixture.hover'] = { enabled: true, settings: {} };
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
const mainBounds = () => host.main.locator('main').first().boundingBox();
async function capture(name) {
  await rail.evaluate(async () => {
    const sources = [...document.querySelectorAll('.ribbon-svg-icon')]
      .map((element) => getComputedStyle(element).maskImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1])
      .filter(Boolean);
    await Promise.all(
      sources.map(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
      }),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await rail.screenshot({ path: path.join(profile, name + '-ribbon.png') });
  const handle = await host.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
      .getNativeWindowHandle()
      .readBigUInt64LE()
      .toString(),
  );
  const result = require('node:child_process').spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'capture-test-window.ps1'),
      '-WindowHandle',
      handle,
      '-OutputFile',
      path.join(profile, name + '.png'),
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}
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
  await until(async () => {
    const s = await state(),
      g = await geometry(),
      rect = await mainBounds();
    const width = s.settings.value.host.ribbonExpandOnHover || expected === 'compact' ? 56 : 200;
    return Math.abs(rect.x - g.bounds.x / s.settings.value.host.zoomFactor - width) <= 1;
  }, `page reservation ${expected}`);
}
async function nativePageGeometry(id) {
  return host.app.evaluate(({ BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    const children = w.contentView.children;
    const ribbon = children.findIndex((v) =>
      v.webContents?.getURL().endsWith('/renderer/workspace/index.html'),
    );
    const page = children.findIndex((v) =>
      v.children.some((c) => c.webContents?.getURL().endsWith(`/hover-page-${id}.html`)),
    );
    if (page < 0) return null;
    const container = children[page],
      view = container.children.find((c) =>
        c.webContents?.getURL().endsWith(`/hover-page-${id}.html`),
      );
    return {
      bounds: container.getBounds(),
      inner: view.getBounds(),
      id: view.webContents.id,
      above: ribbon > page,
    };
  }, id);
}
async function overlayChecks() {
  await move('body');
  await mode('compact');
  await host.main.evaluate(() => window.dock.executeCommand('fixture.hover.main'));
  const page = await host.page('/hover-page-main.html');
  await until(
    async () => (await nativePageGeometry('main'))?.bounds.width > 0,
    'native page ready',
  );
  await page.evaluate(() => window.scrollTo(0, 320));
  // Finish the initial native attachment/resize before measuring hover changes.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await capture('native-compact');
  const before = await nativePageGeometry('main'),
    mainBefore = await mainBounds();
  const metrics = () =>
    page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scroll: scrollY,
      resizes,
      instance,
      clicks,
    }));
  const pageBefore = await metrics();
  await move('inside');
  await mode('expanded');
  assert.deepEqual(await mainBounds(), mainBefore, 'main area does not move or resize');
  assert.deepEqual(
    await nativePageGeometry('main'),
    before,
    'native page retains bounds, view and ribbon order',
  );
  assert.equal(before.above, true, 'ribbon above attached page');
  assert.deepEqual(
    await metrics(),
    pageBefore,
    'page retains viewport, scroll and instance without resize events',
  );
  await capture('native-hover');
  const title = await barPage(host.main, 'titlebar');
  await title.getByRole('button', { name: 'コマンドを検索' }).click();
  const palette = await overlayPage(host.main);
  await mode('compact');
  assert.deepEqual(await mainBounds(), mainBefore, 'palette opening retains page geometry');
  assert.equal(
    await host.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      return w.contentView.children
        .filter((v) => v.getVisible())
        .at(-1)
        .webContents.getURL()
        .endsWith('/command-palette/index.html');
    }),
    true,
    'palette above ribbon and page',
  );
  await move('body');
  await closingAction(palette.keyboard.press('Escape'));
  await until(async () => !(await state()).overlay.active, 'palette dismissal');
  await move('body');
  await mode('compact');
  assert.deepEqual(await metrics(), pageBefore, 'collapse does not resize the native page');
  await move('inside');
  await mode('expanded');
  await host.main.evaluate(() => window.dock.executeCommand('fixture.hover.other'));
  const other = await host.page('/hover-page-other.html');
  await until(
    async () => (await nativePageGeometry('other'))?.above,
    'ribbon stays above a newly attached page',
  );
  await mode('expanded');
  const target = await rail.locator('[data-ribbon-id="settings"]').boundingBox();
  const point = await host.app.evaluate(({ BrowserWindow, screen }, target) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    const view = w.contentView.children.find((v) =>
      v.webContents?.getURL().endsWith('/renderer/workspace/index.html'),
    );
    const b = view.getBounds(),
      o = w.getContentBounds(),
      z = view.webContents.getZoomFactor();
    return screen.dipToScreenPoint({
      x: Math.round(o.x + b.x + (target.x + target.width - 15) * z),
      y: Math.round(o.y + b.y + (target.y + target.height / 2) * z),
    });
  }, target);
  leftDrag(point);
  await until(
    async () => (await state()).navigation.route === 'settings',
    'physical click on overlaid ribbon label',
  );
  assert.equal(
    await other.evaluate(() => window.clicks),
    0,
    'click does not pass through to the page',
  );
  checks.push(
    'hover preserves main/native page bounds, viewport, scroll and instance; page switches keep ribbon in front; physical label click never reaches covered page',
  );
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
    const compactMain = await mainBounds();
    const before = fs.readFileSync(
      file(profile, `settings-${require('node:os').hostname()}.json`),
      'utf8',
    );
    await move('inside');
    await mode('expanded');
    assert.deepEqual(await mainBounds(), compactMain, 'host settings keep their size during hover');
    await move('left');
    await mode('compact');
    assert.equal(
      fs.readFileSync(file(profile, `settings-${require('node:os').hostname()}.json`), 'utf8'),
      before,
      'hover never saves UI state',
    );
    await move('inside');
    await mode('expanded');
    await host.save({ host: { ribbonExpandOnHover: false } });
    await mode('expanded');
    assert.equal(
      (await mainBounds()).width,
      compactMain.width - 144,
      'turning auto off reserves the remembered expanded width',
    );
    await host.save({ host: { ribbonExpandOnHover: true } });
    await mode('expanded');
    assert.deepEqual(
      await mainBounds(),
      compactMain,
      'turning auto on updates reservation even when displayed mode stays expanded',
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
    await overlayChecks();
    await move('body');
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
