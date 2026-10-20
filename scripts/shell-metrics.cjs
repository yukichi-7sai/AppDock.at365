// Fixed portable builds, isolated profiles, sequential runs. Never touches a real profile.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `shell-metrics-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const until = async (fn) => {
  const end = Date.now() + 40000;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Timeout');
};
function metrics(pid) {
  const script = `$all = Get-CimInstance Win32_Process; $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${pid}); do { $added = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } } } while ($added); @($ids | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p) { @{ id=$p.Id; privateBytes=$p.PrivateMemorySize64; workingSet=$p.WorkingSet64; cpuMs=$p.TotalProcessorTime.TotalMilliseconds } } }) | ConvertTo-Json -Compress`;
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
}
(async () => {
  const results = [];
  for (const [index, input] of process.argv.slice(2).entries()) {
    const profile = path.join(output, String(index));
    fs.mkdirSync(profile, { recursive: true });
    const exe = path.join(profile, 'AppDock.at365.exe');
    fs.copyFileSync(path.resolve(input), exe);
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.profile = { name: 'Legacy fixture', avatar: null };
    settings.profile.name = 'Test profile';
    settings.host.hardwareAcceleration = false;
    settings.host.closeToTray = false;
    settings.globalShortcutCommands = [];
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise((r) => server.close(r));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const start = Date.now();
    const child = spawn(exe, [`--test-profile=${profile}`, `--remote-debugging-port=${port}`], {
      env,
      windowsHide: true,
      stdio: 'ignore',
    });
    let browser, page;
    try {
      browser = await until(async () => {
        try {
          return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        } catch {}
      });
      page = await until(() =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/index.html')),
      );
      const snapshot = await until(async () => {
        try {
          const s = await page.evaluate(() => window.dock.snapshot());
          return s.startupReady && (!s.shell || s.shell.active) ? s : null;
        } catch {}
      });
      const readyMs = Date.now() - start;
      await new Promise((r) => setTimeout(r, 3000));
      const before = metrics(child.pid),
        at = Date.now();
      await new Promise((r) => setTimeout(r, 5000));
      const after = metrics(child.pid),
        elapsed = Date.now() - at;
      const sum = (list, key) => list.reduce((v, p) => v + p[key], 0);
      results.push({
        version: snapshot.version,
        sha256: createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),
        readyMs,
        processes: after.length,
        privateMiB: sum(after, 'privateBytes') / 1048576,
        workingSetMiB: sum(after, 'workingSet') / 1048576,
        idleCpuOneCorePercent: ((sum(after, 'cpuMs') - sum(before, 'cpuMs')) / elapsed) * 100,
      });
    } finally {
      if (page)
        await page.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null);
      if (browser) await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify({ ok: true, results }, null, 2),
  );
  console.log(JSON.stringify({ output, results }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
