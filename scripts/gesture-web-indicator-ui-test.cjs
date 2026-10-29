const { launchTestHost } = require('./electron-test-launcher.cjs');
const { getPublishDirectory } = require('./publish-paths.cjs');
const { createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', `gesture-web-ui-${Date.now()}`),
  fixture = path.join(profile, 'extensions/test.web-indicator');
fs.mkdirSync(fixture, { recursive: true });
const commands = ['a', 'b', 'c', 'd'].map((name) => ({
  id: `test.web-indicator.${name}`,
  title: `Command ${name}`,
}));
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.web-indicator',
    name: 'Web indicator fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['storage'],
    commands,
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  "exports.activate=async c=>{for(const name of ['a','b','c','d'])c.commands.register('test.web-indicator.'+name,'Command '+name,async()=>{const list=await c.storage.get('calls')||[];await c.storage.set('calls',[...list,name]);});};",
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
settings.host.hardwareAcceleration = false;
settings.host.theme = 'dark';
settings.extensions['test.web-indicator'] = { enabled: true, settings: {} };
settings.gestures.indicatorStyle = 'pill';
settings.gestures.indicatorPosition = 'window-center';
settings.gestures.bindings = [
  {
    id: 'one',
    command: commands[0].id,
    gesture: 'move-right',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
  ...commands.map((command, index) => ({
    id: 'two' + index,
    command: command.id,
    gesture: 'move-right-up',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  })),
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  for (let index = 0; index < 150; index++) {
    if (await predicate()) return;
    await wait(100);
  }
  throw Error(label);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, child;
const checks = [];
const portable = process.argv.includes('--portable');
const desktopOnly = process.argv.includes('--desktop-only');
const topmostOnly = process.argv.includes('--topmost-only');
const followOnly = process.argv.includes('--follow-only');
const styles = ['pill', 'compact', 'ring', 'classic'];
const groups = followOnly ? 8 : desktopOnly ? 2 : topmostOnly ? 9 : 19;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let artifactHash;
(async () => {
  const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
  if (portable) {
    const source = path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe');
    require('./copy-host.cjs').copyHost(source, executable);
    artifactHash = hash(source);
    assert.equal(hash(executable), artifactHash);
  }
  app = await launchTestHost({
    executablePath: executable,
    portable,
    args: [...(portable ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  let main;
  await until(() => {
    main = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('appdock://host/'));
    return !!main;
  }, 'main renderer exists');
  await until(
    async () => (await main.evaluate(() => window.dock.snapshot())).startupReady,
    'host ready',
  );
  await main.evaluate(() => window.dock.executeCommand('appdock.open'));
  await main.bringToFront();
  const indicator = app
    .context()
    .pages()
    .find((page) => page.url().endsWith('/gesture-indicator.html'));
  assert(indicator, 'dedicated renderer exists');
  await until(
    () => indicator.evaluate(() => !!window.appdockGestureIndicator),
    'preload bridge ready',
  );
  const handles = await app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/gesture-indicator.html'),
    );
    const host = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().startsWith('appdock://host/'),
    );
    return {
      host: host.getNativeWindowHandle().readBigUInt64LE().toString(),
      overlay: overlay.getNativeWindowHandle().readBigUInt64LE().toString(),
      focusable: overlay.isFocusable(),
    };
  });
  assert.equal(handles.focusable, false);
  await app.evaluate(({ ipcMain }) => {
    globalThis.__indicatorFollowRequests = 0;
    ipcMain.on('gesture-indicator:follow', () => globalThis.__indicatorFollowRequests++);
  });
  for (const theme of desktopOnly ? ['dark'] : ['dark', 'light']) {
    await main.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = theme;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, theme);
    await until(
      () => indicator.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
      'shared appearance updated',
    );
    for (const variant of followOnly
      ? styles.map((style) => 'follow-' + style)
      : desktopOnly
        ? ['desktop', 'exe']
        : [
            ...styles,
            ...(topmostOnly ? [] : styles.map((style) => 'follow-' + style)),
            ...(theme === 'dark' ? [...(topmostOnly ? [] : ['desktop', 'exe']), 'external'] : []),
          ]) {
      const desktop = variant === 'desktop' || variant === 'exe';
      const external = variant === 'external';
      const follow = variant.startsWith('follow-');
      const style = desktop || external ? 'pill' : follow ? variant.slice(7) : variant;
      await main.evaluate(
        async ({ style, desktop, scope, follow }) => {
          const s = await window.dock.snapshot();
          s.settings.value.gestures.indicatorStyle = style;
          s.settings.value.gestures.activateOnStart = desktop;
          s.settings.value.gestures.indicatorPosition = follow ? 'cursor-follow' : 'window-center';
          for (const binding of s.settings.value.gestures.bindings)
            binding.when = {
              scope: desktop ? scope : 'global',
              appletIds: [],
              processes: scope === 'exe' ? ['explorer'] : [],
            };
          await window.dock.saveSettings(s.settings.value, s.settings.revision);
        },
        { style, desktop, scope: variant, follow },
      );
      await wait(180);
      const exchange = path.join(profile, theme + '-' + variant);
      fs.mkdirSync(exchange);
      child = spawn(
        path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
        [
          follow
            ? '--follow-indicator-stages'
            : desktop
              ? '--desktop-indicator-stages'
              : external
                ? '--external-indicator-stages'
                : '--indicator-stages',
          handles.host,
          handles.overlay,
          exchange,
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let childOutput = '';
      child.stdout.on('data', (data) => (childOutput += data));
      child.stderr.on('data', (data) => (childOutput += data));
      const completion = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? resolve()
            : reject(Error(childOutput || 'mouse stage helper failed ' + code)),
        );
      });
      void completion.catch(() => {});
      let first, firstNativeSize, previewSequence;
      const stages = follow ? ['one', 'follow', 'edge', 'two'] : ['one', 'two'];
      try {
        for (const stage of stages) {
          await until(
            () => {
              const failure = path.join(exchange, 'helper-failure.txt');
              if (fs.existsSync(failure)) throw Error(fs.readFileSync(failure, 'utf8'));
              return fs.existsSync(path.join(exchange, stage + '.json'));
            },
            style + ' ' + stage + ' mouse stage',
          );
          const state = JSON.parse(fs.readFileSync(path.join(exchange, stage + '.json'), 'utf8'));
          assert.equal(state.targetMatched, true, 'gesture target retains foreground');
          if (!desktop) {
            assert.equal(String(state.foreground), String(state.target), 'foreground retained');
            assert.equal(state.external, external);
            assert.equal(state.targetTopmost, true, 'isolated target is topmost');
            assert.equal(state.overlayAboveTarget, true, 'overlay is above the topmost target');
            if (external) {
              assert.equal(state.externalTopmost, true, 'competing native window is topmost');
              assert.equal(
                state.overlayAboveExternal,
                true,
                'overlay is above the other process window',
              );
            }
          }
          assert.equal(state.overlayDemotedBeforeStart, true);
          assert.equal(
            state.overlayFlags & 0x080000a8,
            0x080000a8,
            'topmost is restored with transparent, no-activate and tool-window flags',
          );
          await until(
            () =>
              app.evaluate(({ BrowserWindow }) =>
                BrowserWindow.getAllWindows()
                  .find((win) => win.webContents.getURL().endsWith('/gesture-indicator.html'))
                  .isVisible(),
              ),
            'overlay visible',
          );
          await until(
            () =>
              indicator
                .locator('.gesture-preview-caption')
                .count()
                .then((count) => count === (stage === 'two' ? 4 : 1)),
            'caption count',
          );
          if (follow)
            await until(
              () =>
                app.evaluate(({ BrowserWindow, screen }) => {
                  const bounds = BrowserWindow.getAllWindows()
                    .find((win) => win.webContents.getURL().endsWith('/gesture-indicator.html'))
                    .getBounds();
                  const cursor = screen.getCursorScreenPoint();
                  const display = screen.getDisplayNearestPoint(cursor).bounds;
                  return (
                    bounds.x ===
                      Math.max(
                        display.x,
                        Math.min(display.x + display.width - bounds.width, cursor.x + 16),
                      ) &&
                    bounds.y ===
                      Math.max(
                        display.y,
                        Math.min(display.y + display.height - bounds.height, cursor.y + 16),
                      )
                  );
                }),
              'cursor-follow reaches the cursor with screen-edge clipping',
            );
          const current = await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((win) => win.webContents.getURL().endsWith('/gesture-indicator.html'))
              .getBounds(),
          );
          if (desktop) {
            const center = await app.evaluate(
              ({ screen }, point) => screen.screenToDipPoint(point),
              { x: state.centerX, y: state.centerY },
            );
            assert(
              Math.abs(current.x + current.width / 2 - center.x) <= 1 &&
                Math.abs(current.y + current.height / 2 - center.y) <= 1,
              'desktop window-center resolves to the starting monitor center',
            );
          }
          if (follow) {
            const frame = await indicator.evaluate(() => window.appdockGestureIndicator.connect());
            if (stage === 'one') {
              first = current;
              firstNativeSize = [state.overlayWidth, state.overlayHeight];
              previewSequence = frame.sequence;
            } else if (stage !== 'two') {
              assert.equal(
                frame.sequence,
                previewSequence,
                'position-only motion does not redraw content',
              );
              assert.deepEqual(frame.model.directions, ['right']);
              assert.deepEqual(frame.model.captions, ['Command a']);
              if (stage === 'follow')
                assert(current.x > first.x, 'same-direction movement follows the cursor');
            }
          }
          if (style === 'pill') {
            if (stage === 'one') first = current;
            else if (follow)
              assert.deepEqual(
                [state.overlayWidth, state.overlayHeight],
                firstNativeSize,
                'pill size remains stable while following',
              );
            else
              assert.deepEqual(
                current,
                first,
                'pill bounds stable across directions and command counts',
              );
          }
          assert.equal(
            await indicator.locator('.gesture-preview-arrows svg').count(),
            style === 'classic' ? 0 : stage === 'two' ? 2 : 1,
          );
          assert.equal(
            await indicator.evaluate(
              () => getComputedStyle(document.documentElement).backgroundColor,
            ),
            'rgba(0, 0, 0, 0)',
          );
          if (style === 'classic' && stage === 'two')
            assert(
              await indicator
                .locator('.gesture-indicator-captions')
                .evaluate((element) => element.scrollHeight <= element.clientHeight),
              'classic shows all 4 caption rows',
            );
          if (stage === 'one') {
            const frame = await indicator.evaluate(() => window.appdockGestureIndicator.connect());
            const after = await app.evaluate(({ BrowserWindow, ipcMain }, sequence) => {
              const overlay = BrowserWindow.getAllWindows().find((win) =>
                win.webContents.getURL().endsWith('/gesture-indicator.html'),
              );
              const host = BrowserWindow.getAllWindows().find((win) =>
                win.webContents.getURL().startsWith('appdock://host/'),
              );
              ipcMain.emit(
                'gesture-indicator:measured',
                { sender: host.webContents, senderFrame: host.webContents.mainFrame },
                { sequence, width: 1, height: 1 },
              );
              ipcMain.emit(
                'gesture-indicator:measured',
                { sender: overlay.webContents, senderFrame: null },
                { sequence, width: 1, height: 1 },
              );
              ipcMain.emit(
                'gesture-indicator:measured',
                { sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame },
                { sequence: sequence - 1, width: 1, height: 1 },
              );
              ipcMain.emit(
                'gesture-indicator:measured',
                { sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame },
                { sequence, width: 1025, height: 1 },
              );
              return overlay.getBounds();
            }, frame.sequence);
            assert.deepEqual(
              after,
              current,
              'untrusted/stale/out-of-bounds resize reports ignored',
            );
          }
          await indicator.screenshot({
            path: path.join(profile, `${theme}-${variant}-${stage}.png`),
          });
          fs.writeFileSync(path.join(exchange, stage + '.continue'), 'go');
        }
        await completion;
      } finally {
        for (const stage of stages)
          fs.writeFileSync(path.join(exchange, stage + '.continue'), 'go');
      }
      await until(
        () =>
          app.evaluate(
            ({ BrowserWindow }) =>
              !BrowserWindow.getAllWindows()
                .find((win) => win.webContents.getURL().endsWith('/gesture-indicator.html'))
                .isVisible(),
          ),
        'overlay hides after release',
      );
      checks.push(
        `${theme}/${variant}: actual mouse input / topmost recovery and native z-order / 1-to-2 direction update / ordered captions / transparent no-focus overlay / release hides${follow ? ' / same-direction cursor following without content updates / screen-edge clipping' : ''}`,
      );
    }
  }
  const callsPath = path.join(profile, 'data/storage/test.web-indicator/calls.json');
  await until(
    () =>
      indicator
        .locator('.gesture-preview-indicator')
        .count()
        .then((count) => count === 0),
    'hidden indicator content removed',
  );
  const hiddenRequests = await app.evaluate(() => globalThis.__indicatorFollowRequests);
  await wait(250);
  assert.equal(
    await app.evaluate(() => globalThis.__indicatorFollowRequests),
    hiddenRequests,
    'hidden indicator stops frame requests',
  );
  await until(
    () =>
      fs.existsSync(callsPath) &&
      JSON.parse(fs.readFileSync(callsPath, 'utf8')).length === groups * 4,
    'all commands execute on release',
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(callsPath, 'utf8')),
    Array(groups).fill(['a', 'b', 'c', 'd']).flat(),
  );
  checks.push(
    'pill keeps HWND bounds while 1 caption becomes 4; original command selection and order retained',
  );
  if (desktopOnly) {
    await main.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.gestures.activateOnStart = false;
      for (const binding of s.settings.value.gestures.bindings)
        binding.when = { scope: 'global', appletIds: [], processes: [] };
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await wait(180);
  }
  const errors = (await main.evaluate(() => window.dock.snapshot())).logs.filter(
    (entry) => entry.level === 'error',
  );
  assert.deepEqual(errors, []);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().endsWith('/gesture-indicator.html'))
      .webContents.forcefullyCrashRenderer(),
  );
  await until(
    () =>
      app.evaluate(
        ({ BrowserWindow }) =>
          !BrowserWindow.getAllWindows().some((win) =>
            win.webContents.getURL().endsWith('/gesture-indicator.html'),
          ),
      ),
    'failed renderer removed',
  );
  await until(
    () =>
      main
        .evaluate(() => window.dock.snapshot())
        .then((snapshot) =>
          snapshot.logs.some(
            (entry) =>
              entry.level === 'error' && entry.message.includes('GESTURE_INDICATOR_UNAVAILABLE'),
          ),
        ),
    'display failure reported through the common error path',
  );
  await new Promise((resolve, reject) => {
    const helper = spawn(
      path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
      ['--send', handles.host, 'move-right-up'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    helper.stderr.on('data', (data) => (output += data));
    helper.stdout.on('data', (data) => (output += data));
    helper.on('error', reject);
    helper.on('exit', (code) => {
      fs.writeFileSync(path.join(profile, 'after-renderer-failure-input.log'), output);
      code === 0 ? resolve() : reject(Error(output));
    });
  });
  await until(
    () => JSON.parse(fs.readFileSync(callsPath, 'utf8')).length === (groups + 1) * 4,
    'input capture still executes gestures without a display',
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(callsPath, 'utf8')),
    Array(groups + 1)
      .fill(['a', 'b', 'c', 'd'])
      .flat(),
  );
  checks.push(
    'renderer crash removes the window, reports the display failure once and preserves gesture execution',
  );
  const finalErrors = (await main.evaluate(() => window.dock.snapshot())).logs.filter(
    (entry) => entry.level === 'error',
  );
  assert.equal(finalErrors.length, 1);
  assert.match(finalErrors[0].message, /GESTURE_INDICATOR_UNAVAILABLE/);
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify({ ok: true, profile, checks, portable, sha256: artifactHash }, null, 2),
  );
  if (portable) assert.equal(hash(executable), artifactHash);
  console.log(
    JSON.stringify({ ok: true, profile, checks, portable, sha256: artifactHash }, null, 2),
  );
})()
  .catch((error) => {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child && child.exitCode === null) child.kill();
    await app?.close();
  });
