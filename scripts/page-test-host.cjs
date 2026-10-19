const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { _electron, chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function until(callback, label, timeout = 30000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) {
    try { const value = await callback(); if (value) return value; } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw Error(label + (last ? ': ' + last.message : ''));
}
async function launch(profile, portable, extraEnvironment = {}) {
  const env = { ...process.env, LOCALAPPDATA: path.join(profile, 'LocalAppData'), ...extraEnvironment };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, child, browser, main;
  if (!portable) {
    app = await _electron.launch({ executablePath: require('electron'), args: [root, `--test-profile=${profile}`], env });
    main = await app.firstWindow();
  } else {
    const exe = path.join(profile, 'AppDock.at365.exe'); fs.copyFileSync(portable, exe);
    if (hash(exe) !== hash(portable)) throw Error('Fixed EXE hash mismatch');
    const debug = await freePort(), inspector = await freePort();
    child = spawn(exe, [`--test-profile=${profile}`, `--remote-debugging-port=${debug}`, `--inspect=127.0.0.1:${inspector}`], { cwd: profile, env, windowsHide: true, stdio: 'ignore' });
    browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }), 'fixed EXE CDP', 60000);
    const context = browser.contexts()[0];
    main = await until(() => context.pages().find(page => page.url().startsWith('appdock://host/index.html')), 'host page');
    app = { context: () => context,
      evaluate: (fn, arg) => inspect(inspector, `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`),
      close: async () => {
        if (child.exitCode === null) { await main.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {}); await until(() => child.exitCode !== null, 'normal fixed EXE shutdown'); }
        await browser.close(); if (child.exitCode !== 0) throw Error('EXE exited with ' + child.exitCode);
      },
    };
  }
  main.setDefaultTimeout(15000);
  await until(async () => (await main.evaluate(() => window.dock.snapshot())).startupReady, 'startup ready');
  return { app, main, hash: portable ? hash(portable) : undefined,
    page: suffix => until(() => app.context().pages().find(page => page.url().endsWith(suffix) && !page.isClosed()), 'page ' + suffix),
    resize: (width, height) => app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('appdock://host/index.html'));
      window.setSize(size.width, size.height);
    }, { width, height }),
    save: (change) => main.evaluate(async (change) => {
      const state = await window.dock.snapshot(), next = structuredClone(state.settings.value);
      if (change.host) Object.assign(next.host, change.host);
      if (change.extensionId) {
        const extension = next.extensions[change.extensionId];
        if (change.settings) Object.assign(extension.settings, change.settings);
        if (change.pages) extension.pages = { ...extension.pages, ...change.pages };
      }
      await window.dock.saveSettings(next, state.settings.revision);
    }, change),
    close: () => app.close(),
  };
}
module.exports = { launch, until, hash };
