const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { ProcessLaunchService, processLaunchSpec } = require('../out/main/main/core/process-launch');
const { parseProcessLaunch, processCommandType } = require('../out/main/shared/process-launch');
const { compileCustomType } = require('../out/main/main/core/custom-commands');
const { operationsFor } = require('../out/main/shared/appdock-api');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fixture(t) {
  fs.mkdirSync('.artifacts/process-launch-unit', { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('.artifacts/process-launch-unit/case-'));
  const service = new ProcessLaunchService(dir);
  t.after(() => service.close());
  return { dir, service };
}
async function exists(file) {
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    await sleep(50);
  }
  throw Error('fixture did not finish');
}
test('process configuration is a bounded explicit mode and never a shell fallback', () => {
  const valid = { mode: 'executable', executable: process.execPath, arguments: [] };
  assert.equal(parseProcessLaunch(valid).showConsole, false);
  assert(compileCustomType(processCommandType)(valid).valid);
  for (const config of [
    { ...valid, executable: 'node.exe' },
    { ...valid, executable: 'C:\\script.cmd' },
    { ...valid, arguments: ['\0'] },
    { ...valid, workingDirectory: null },
    { ...valid, showConsole: null },
    { mode: 'cmd', command: 'ok\nnext' },
    { mode: 'cmd', command: 'echo x', script: 'extra' },
    { mode: 'powershell', script: 'x'.repeat(8193) },
  ])
    assert.throws(() => parseProcessLaunch(config));
  const spec = processLaunchSpec({ mode: 'cmd', command: '"C:\\space x\\x.exe" "a&b"' }, 'A:\\app');
  assert.deepEqual(spec.args, ['/d', '/s', '/c', '""C:\\space x\\x.exe" "a&b""']);
  assert.equal(spec.verbatim, true);
  assert.throws(() => processLaunchSpec({ mode: 'cmd', command: 'x'.repeat(8192) }, 'A:\\app'));
  const ps = processLaunchSpec({ mode: 'powershell', script: '日本語 "quoted"' }, 'A:\\app');
  assert.equal(Buffer.from(ps.args.at(-1), 'base64').toString('utf16le'), '日本語 "quoted"');
  assert(!operationsFor('mcp').some(([id]) => id === 'processes.start'));
  assert(operationsFor('applet').some(([id]) => id === 'processes.start'));
});
test('direct executable preserves argv and cwd and acknowledges launch without exposing config', async (t) => {
  const { dir, service } = fixture(t),
    script = path.join(dir, 'fixture with space 日本語.cjs'),
    out = path.join(dir, 'argv.json');
  fs.writeFileSync(
    script,
    "console.log('ignored output');console.error('ignored error');require('node:fs').writeFileSync(process.argv[2],JSON.stringify({args:process.argv.slice(3),cwd:process.cwd()}));process.exitCode=17;",
  );
  const args = ['', '日本語', 'space value', 'embedded"quote', 'trail\\', '&|<>%^!'];
  const result = await service.start({
    mode: 'executable',
    executable: process.execPath,
    arguments: [script, out, ...args],
    workingDirectory: dir,
  });
  assert.deepEqual(result, { completion: 'processStarted', effectVerified: false });
  assert.deepEqual(JSON.parse(await exists(out)), { args, cwd: dir });
});
test('explicit cmd and encoded PowerShell execute only their supplied fixture code', async (t) => {
  const { dir, service } = fixture(t),
    recorder = path.join(dir, 'cmd fixture.cjs'),
    cmdOut = path.join(dir, 'cmd.json'),
    psOut = path.join(dir, 'ps.txt');
  fs.writeFileSync(
    recorder,
    "require('node:fs').writeFileSync(process.argv[2],JSON.stringify(process.argv.slice(3)));",
  );
  const args = ['literal & | < > ^ ! 100%', '日本語'];
  const command =
    '"' +
    process.execPath +
    '" "' +
    recorder +
    '" "' +
    cmdOut +
    '" "' +
    args[0] +
    '" "' +
    args[1] +
    '"';
  await service.start({ mode: 'cmd', command, workingDirectory: dir });
  assert.deepEqual(JSON.parse(await exists(cmdOut)), args);
  const literal = "'" + psOut.replaceAll("'", "''") + "'";
  await service.start({
    mode: 'powershell',
    script: '[IO.File]::WriteAllText(' + literal + ', "PowerShell 日本語", [Text.Encoding]::UTF8)',
    workingDirectory: dir,
  });
  assert.equal(await exists(psOut), 'PowerShell 日本語');
});
test('closed service does not terminate an already started process; new launches are refused', async (t) => {
  const { dir, service } = fixture(t),
    file = path.join(dir, 'survived.txt'),
    script = path.join(dir, 'survive.cjs');
  fs.writeFileSync(
    script,
    "setTimeout(()=>require('node:fs').writeFileSync(process.argv[2],'alive'),300);",
  );
  await service.start({
    mode: 'executable',
    executable: process.execPath,
    arguments: [script, file],
  });
  service.close();
  assert.equal(await exists(file), 'alive');
  await assert.rejects(
    service.start({ mode: 'executable', executable: process.execPath, arguments: [] }),
    (e) => e.code === 'NOT_READY',
  );
});
test('launched processes survive the actual launcher process exiting', async (t) => {
  const { dir } = fixture(t),
    file = path.join(dir, 'after-parent-exit.txt'),
    script = path.join(dir, 'parent.cjs');
  const servicePath = require.resolve('../out/main/main/core/process-launch');
  fs.writeFileSync(
    script,
    'const {ProcessLaunchService}=require(' +
      JSON.stringify(servicePath) +
      ');const service=new ProcessLaunchService(' +
      JSON.stringify(dir) +
      ');service.start({mode:"powershell",script:' +
      JSON.stringify(
        "Start-Sleep -Milliseconds 400; [IO.File]::WriteAllText('" + file + "', 'alive')",
      ) +
      '}).then(()=>service.close(),()=>{service.close();process.exitCode=1;});',
  );
  const { spawn } = require('node:child_process');
  const parent = spawn(process.execPath, [script], { stdio: 'ignore', windowsHide: true });
  assert.equal(
    await new Promise((resolve, reject) => {
      parent.once('error', reject);
      parent.once('exit', resolve);
    }),
    0,
  );
  assert.equal(await exists(file), 'alive');
});
test('cancellation, caller revocation, missing files and cwd fail before execution', async (t) => {
  const { dir, service } = fixture(t),
    config = { mode: 'executable', executable: process.execPath, arguments: [] };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    service.start(config, { signal: controller.signal }),
    (e) => e.code === 'CANCELLED',
  );
  await assert.rejects(
    service.start(config, {}, () => false),
    (e) => e.code === 'API_DISABLED',
  );
  let checks = 0;
  await assert.rejects(
    service.start(config, {}, () => ++checks === 1),
    (e) => e.code === 'API_DISABLED',
  );
  await assert.rejects(
    service.start({ ...config, executable: path.join(dir, 'missing.exe') }),
    (e) => e.code === 'PROCESS_START_FAILED' && !e.message.includes(dir),
  );
  await assert.rejects(
    service.start({ ...config, workingDirectory: path.join(dir, 'missing') }),
    (e) => e.code === 'PROCESS_START_FAILED',
  );
});
