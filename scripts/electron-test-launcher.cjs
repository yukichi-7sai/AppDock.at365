// The portable NSIS launcher does not forward the child's inspector output.
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
async function launchTestHost({ executablePath, portable, mainInspector = false, args, env }) {
  if (!portable && !mainInspector) return electron.launch({ executablePath, args, env });
  const port = await freePort(),
    mainPort = await freePort();
  const child = spawn(
    executablePath,
    [...args, '--remote-debugging-port=' + port, '--inspect=' + mainPort],
    { env, windowsHide: true, stdio: 'ignore' },
  );
  let browser, spawnError;
  child.on('error', (error) => {
    spawnError = error;
  });
  async function until(fn, message) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (await fn()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(message);
  }
  try {
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'Portable CDP connection timed out');
    await until(async () => {
      try {
        return (await inspect(mainPort, '1')) === 1;
      } catch {
        return false;
      }
    }, 'Portable main inspector timed out');
  } catch (error) {
    await inspect(
      mainPort,
      'setTimeout(() => ' + electronExpression + '.app.quit(), 100); true',
    ).catch(() => {});
    await browser?.close().catch(() => {});
    throw error;
  }
  return {
    context: () => browser.contexts()[0],
    evaluate: (fn, arg) =>
      inspect(
        mainPort,
        '(' + fn.toString() + ')(' + electronExpression + ', ' + JSON.stringify(arg) + ')',
      ),
    close: async () => {
      if (child.exitCode === null)
        await inspect(
          mainPort,
          'setTimeout(() => ' + electronExpression + '.app.quit(), 100); true',
        ).catch(() => {});
      await until(() => child.exitCode !== null, 'Portable shutdown timed out');
      await browser.close().catch(() => {});
      if (child.exitCode !== 0) throw Error('Portable host exited with code ' + child.exitCode);
    },
  };
}
module.exports = { launchTestHost };
