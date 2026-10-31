const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
async function until(fn, label) {
  const end = Date.now() + 30000;
  let last;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label + (last ? ': ' + last : ''));
}
function isolatedHost(profile, portable) {
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(profile, { recursive: true });
  let exe = require('electron');
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (portable) {
    exe = path.join(profile, 'AppDock.at365.exe');
    require('./copy-host.cjs').copyHost(path.resolve(portable), exe);
    assert.equal(hash(exe), hash(portable));
  }
  let child, browser, host, inspector;
  const api = {
    async start() {
      const debug = await freePort();
      inspector = await freePort();
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const log = fs.openSync(path.join(profile, 'process.log'), 'a');
      child = spawn(
        exe,
        [
          ...(portable ? [] : [root]),
          `--test-profile=${profile}`,
          `--test-local-state=${path.join(profile, 'local')}`,
          `--remote-debugging-port=${debug}`,
          `--inspect=127.0.0.1:${inspector}`,
        ],
        { cwd: profile, env, windowsHide: false, stdio: ['ignore', log, log] },
      );
      fs.closeSync(log);
      browser = await until(
        () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
        'CDP',
      );
      host = await until(
        () =>
          browser
            .contexts()
            .flatMap((c) => c.pages())
            .find((p) => p.url().startsWith('appdock://host/index.html')),
        'host page',
      );
      await until(
        async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
        'startup ready',
      );
      return host;
    },
    evaluate: (fn, arg) =>
      inspect(
        inspector,
        `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
      ),
    context: () => browser.contexts()[0],
    firstWindow: async () => host,
    async close() {
      if (!child) return;
      await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null, 'host shutdown');
      await browser?.close();
      child = browser = host = undefined;
    },
    executableHash: hash(exe),
  };
  return api;
}
module.exports = { isolatedHost, until };
