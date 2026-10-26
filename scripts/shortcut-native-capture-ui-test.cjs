const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const rootDirectory = path.resolve(__dirname, '..');
const development = !process.argv[2];
const profile = path.join(rootDirectory, '.artifacts', 'shortcut-native-capture-ui-' + Date.now());
const fixture = path.join(profile, 'extensions/fixture.capture');
fs.mkdirSync(fixture, { recursive: true });
const settings = createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.updates.checkHostOnAboutOpen = false;
settings.keybindings = [];
settings.gestures.enabled = false;
settings.gestures.bindings = [];
settings.touchpadGestures.enabled = false;
settings.touchpadGestures.bindings = [];
settings.extensions['fixture.capture'] = { enabled: true, settings: {} };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.capture',
    name: 'Capture diagnostic',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    commands: [{ id: 'fixture.capture.run', title: 'Capture diagnostic command' }],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  "exports.activate=async c=>c.commands.register('fixture.capture.run','Capture diagnostic command',async()=>{});",
);
const source = process.argv[2] ? path.resolve(process.argv[2]) : null;
const executable = path.join(profile, 'AppDock.at365.exe');
if (!development) fs.copyFileSync(source, executable);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!development) assert.equal(hash(source), hash(executable));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  do {
    if (await fn()) return;
    await sleep(50);
  } while (Date.now() < deadline);
  throw Error(label);
}
let app,
  helper,
  peer,
  root,
  host,
  handle,
  imeToggles = 0;
const cases = [];
(async () => {
  try {
    const built = spawnSync(
      'dotnet',
      [
        'publish',
        'tests/fixtures/dotnet/AppDock.InputTarget/AppDock.InputTarget.csproj',
        '-c',
        'Release',
        '-o',
        '.artifacts/shortcut-native-capture-helper',
      ],
      { cwd: rootDirectory, stdio: 'pipe', windowsHide: true },
    );
    fs.writeFileSync(
      path.join(profile, 'helper-build.log'),
      String(built.stdout ?? '') + String(built.stderr ?? ''),
    );
    if (built.error) throw built.error;
    assert.equal(built.status, 0, 'input helper build');
    helper = spawn(
      path.join(rootDirectory, '.artifacts/shortcut-native-capture-helper/AppDock.InputTarget.exe'),
      [],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    helper.stderr.on('data', (chunk) => fs.appendFileSync(path.join(profile, 'helper.log'), chunk));
    peer = new JsonLinePeer(helper.stdout, helper.stdin, async () => {});
    await peer.request('snapshot');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await launchTestHost({
      executablePath: development ? require('electron') : executable,
      portable: !development,
      args: [
        ...(development ? [rootDirectory] : []),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
      ],
      env,
    });
    await until(
      async () => {
        root = app
          .context()
          .pages()
          .find((page) => page.url().startsWith('appdock://host/'));
        return (
          root && (await root.evaluate(async () => (await window.dock?.snapshot())?.startupReady))
        );
      },
      'startup',
      30000,
    );
    host = settingsAwarePage(root);
    handle = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
        .getNativeWindowHandle()
        .readBigUInt64LE()
        .toString(),
    );
    await root.evaluate(() => {
      window.__captures = [];
      window.__focusEvents = [];
      window.dock.onShortcutCaptured((event) => window.__captures.push(event));
      window.addEventListener('blur', () => window.__focusEvents.push('blur'));
      window.addEventListener('focus', () => window.__focusEvents.push('focus'));
    });
    await root.evaluate(() => window.dock.executeCommand('appdock.settings.command-triggers.open'));
    const dialog = host.getByTestId('settings-dialog');
    const recorder = dialog.locator('.shortcut-capture');
    const focus = async () => {
      await peer.request('focusWindow', { window: handle });
      await until(async () => (await peer.request('snapshot')).foreground === handle, 'foreground');
      await sleep(150);
    };
    for (const phase of [0, 1, 2]) {
      await focus();
      if (phase) {
        await host
          .getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true })
          .focus();
        await peer.request('imeChord', {
          window: handle,
          key: 0x19,
          scan: 0x29,
          physical: true,
          modifiers: [],
        });
        imeToggles++;
        await sleep(250);
      }
      await host.locator('[data-shortcut-command="fixture.capture.run"] .command-title').hover();
      await host.getByTestId('binding-add:fixture.capture.run:shortcuts').click();
      await dialog.getByText('押して入力', { exact: true }).waitFor();
      await recorder.click();
      await focus();
      await sleep(150);
      await recorder.evaluate((el) => {
        window.__dom = [];
        window.__alerts = [];
        el.addEventListener('keydown', (e) =>
          window.__dom.push({
            key: e.key,
            code: e.code,
            repeat: e.repeat,
            composing: e.isComposing,
            keyCode: e.keyCode,
            ctrl: e.ctrlKey,
            alt: e.altKey,
            win: e.metaKey,
          }),
        );
        window.__alertObserver?.disconnect();
        window.__alertObserver = new MutationObserver(() => {
          const alerts = [...document.querySelectorAll('[role=alert]')]
            .map((e) => e.textContent)
            .filter(Boolean);
          window.__alerts.push(...alerts);
        });
        window.__alertObserver.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      });
      const recorderUrl = (await recorder.page()).url();
      const recorderBox = await recorder.boundingBox();
      const clickPoint = await app.evaluate(
        ({ BrowserWindow, screen }, { url, box }) => {
          function locate(view, x = 0, y = 0) {
            const b = view.getBounds();
            x += b.x;
            y += b.y;
            if (view.webContents?.getURL() === url) return { x, y };
            for (const child of view.children ?? []) {
              const found = locate(child, x, y);
              if (found) return found;
            }
          }
          for (const window of BrowserWindow.getAllWindows()) {
            const offset =
              window.webContents.getURL() === url ? { x: 0, y: 0 } : locate(window.contentView);
            if (!offset) continue;
            const content = window.getContentBounds();
            return screen.dipToScreenPoint({
              x: Math.round(content.x + offset.x + box.x + box.width / 2),
              y: Math.round(content.y + offset.y + box.y + box.height / 2),
            });
          }
          throw Error('Recorder view not found: ' + url);
        },
        { url: recorderUrl, box: recorderBox },
      );
      let caseIndex = 0;
      for (const physical of [false, true])
        for (const [name, modifiers, key, scan] of [
          ['Ctrl+KanaMode', [0x11], 0xf2, 0x70],
          ['Win+KanaMode', [0x5b], 0xf2, 0x70],
          ['Alt+KanaMode', [0x12], 0xf6, 0x70],
          ['Alt+KanaMode', [0x12], 0xf5, 0x70],
          ['KanaMode', [], 0xf2, 0x70],
          ['Convert', [], 0x1c, 0x79],
          ['Ctrl+Alt+NonConvert', [0x11, 0x12], 0xf7, 0x7b],
        ]) {
          const before = await recorder.locator('kbd').allTextContents();
          await root.evaluate(() => {
            window.__captures = [];
            window.__focusEvents = [];
          });
          await recorder.evaluate(() => {
            window.__dom = [];
            window.__alerts = [];
          });
          if (caseIndex++ > 0) {
            await peer.request('click', { ...clickPoint, window: handle });
            await sleep(150);
            assert(
              await recorder.evaluate((el) => document.activeElement === el),
              'native click stays on recorder',
            );
          }
          await peer.request('imeChord', { window: handle, key, scan, physical, modifiers });
          await sleep(350);
          const state = await peer.request('snapshot');
          const trace = {
            phase,
            physical,
            expected: name,
            before,
            after: await recorder.locator('kbd').allTextContents(),
            captured: await root.evaluate(() => window.__captures),
            focus: await root.evaluate(() => window.__focusEvents),
            dom: await recorder.evaluate(() => window.__dom),
            alerts: await recorder.evaluate(() => [...new Set(window.__alerts)]),
            foregroundMatches: state.foreground === handle,
          };
          cases.push(trace);
          console.log(
            JSON.stringify({
              phase,
              physical,
              expected: name,
              actual: trace.after.join('+'),
              captured: trace.captured.length,
              alerts: trace.alerts,
            }),
          );
        }
      await dialog.getByTestId('binding-cancel').click();
      await dialog.waitFor({ state: 'hidden' });
    }
    assert.equal(cases.length, 42);
    assert(
      cases.every(
        (item) =>
          item.captured.length === 1 &&
          item.captured[0].key === item.expected &&
          item.after.join('+') === item.expected &&
          item.alerts.length === 0 &&
          item.foregroundMatches,
      ),
      'every input must reach native capture after re-clicking',
    );
    assert.equal(
      new Set(cases.map((item) => item.captured[0].token)).size,
      cases.length,
      'each recorder click starts a fresh capture session',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success: true,
          completed: true,
          profile,
          development,
          sha256: development ? null : hash(executable),
          cases,
          keysSent: [
            'Ctrl',
            'Alt',
            'Win',
            'KanaMode position',
            'Convert position',
            'NonConvert position',
            'IME toggle position',
          ],
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success: true, checks: cases.length, profile }));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'error.json'),
      JSON.stringify({ error: String(error.stack), cases }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (imeToggles % 2 && peer && handle) {
      await peer.request('focusWindow', { window: handle }).catch(() => {});
      await peer
        .request('imeChord', {
          window: handle,
          key: 0x19,
          scan: 0x29,
          physical: true,
          modifiers: [],
        })
        .catch(() => {});
    }
    await app?.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
    helper?.stdin.end();
    if (helper) await until(() => helper.exitCode !== null, 'input helper shutdown');
  }
})();
