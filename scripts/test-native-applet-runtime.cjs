// Inspect a published .NET single-file Applet and exercise its shared runtime startup.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");

const [executable, evidence] = process.argv.slice(2);
assert(executable && path.isAbsolute(executable), "Pass an absolute published EXE path");
assert(evidence && path.isAbsolute(evidence), "Pass an absolute Applet .artifacts evidence directory");
assert.equal(process.platform, "win32");
fs.mkdirSync(evidence, { recursive: true });

// .NET bundle format: https://github.com/dotnet/runtime/blob/main/src/installer/managed/Microsoft.NET.HostModel/Bundle/Manifest.cs
const bytes = fs.readFileSync(executable);
const signature = Buffer.from("8b1202b96a612038727b930214d7a03213f5b9e6efae3318ee3b2dce24b36aae", "hex");
const marker = bytes.indexOf(signature);
assert(marker >= 8, "Expected a .NET single-file bundle");
let position = Number(bytes.readBigInt64LE(marker - 8));
function integer64() {
  const value = Number(bytes.readBigInt64LE(position));
  position += 8;
  assert(Number.isSafeInteger(value) && value >= 0);
  return value;
}
function string() {
  let length = 0, shift = 0, next;
  do {
    assert(shift < 35 && position < bytes.length, "Invalid bundle string length");
    next = bytes[position++];
    length += (next & 0x7f) * 2 ** shift;
    shift += 7;
  } while (next & 0x80);
  assert(position + length <= bytes.length);
  const value = bytes.toString("utf8", position, position + length);
  position += length;
  return value;
}
const major = bytes.readUInt32LE(position);
const count = bytes.readInt32LE(position + 8);
position += 12;
assert.equal(major, 6, "Review the bundle reader when the .NET bundle format changes");
assert(count > 0);
string(); // bundle ID
integer64(); integer64(); // deps.json location
const configOffset = integer64(), configSize = integer64();
integer64(); // bundle flags
assert(configOffset > 0 && configSize > 0 && configOffset + configSize <= bytes.length);
const config = JSON.parse(bytes.toString("utf8", configOffset, configOffset + configSize));
fs.writeFileSync(path.join(evidence, "runtimeconfig.json"), JSON.stringify(config, null, 2));
assert.equal(config.runtimeOptions.includedFrameworks, undefined, "Self-contained runtime is bundled");
const frameworks = config.runtimeOptions.frameworks ?? [config.runtimeOptions.framework];
for (const name of ["Microsoft.NETCore.App", "Microsoft.WindowsDesktop.App"]) {
  assert(frameworks.some((entry) => entry?.name === name && /^10\./.test(entry.version)), `Missing shared ${name} 10 reference`);
}
const bundled = [];
for (let index = 0; index < count; index++) {
  integer64(); integer64(); integer64();
  position++; // file type
  bundled.push(string());
}
const runtimeFile = /^(?:coreclr|clrjit|hostfxr|hostpolicy|System\.Private\.CoreLib|PresentationCore|PresentationFramework|System\.Windows\.Forms|WindowsBase)\.dll$/i;
for (const file of [...bundled, ...fs.readdirSync(path.dirname(executable))]) {
  assert(!runtimeFile.test(path.basename(file)), `Bundled runtime file: ${file}`);
}
fs.writeFileSync(path.join(evidence, "bundle-files.json"), JSON.stringify(bundled, null, 2));

async function run(name, overrides) {
  const trace = path.join(evidence, `${name}-host-trace.log`);
  fs.writeFileSync(trace, "");
  const child = spawn(executable, [], {
    env: { ...process.env, DOTNET_HOST_TRACE: "1", DOTNET_HOST_TRACE_VERBOSITY: "4", DOTNET_HOST_TRACEFILE: trace, DOTNET_DISABLE_GUI_ERRORS: "1", ...overrides },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") { child.kill(); reject(error); }
    });
  });
  child.stdin.end(); // No activate request: no clock or desktop presentation.
  const result = { ...await finished, stdout, stderr };
  fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  return { ...result, trace: fs.readFileSync(trace, "utf8") };
}

(async () => {
  const installed = await run("installed", {});
  assert.equal(installed.code, 0, installed.stderr);
  for (const framework of ["Microsoft.NETCore.App", "Microsoft.WindowsDesktop.App"]) {
    assert(installed.trace.replaceAll("\\", "/").includes(`/shared/${framework}/`), `Shared runtime was not resolved: ${framework}`);
  }
  const emptyRoot = fs.mkdtempSync(path.join(evidence, "empty-dotnet-"));
  let missing;
  try {
    missing = await run("missing", { DOTNET_ROOT: emptyRoot, DOTNET_ROOT_X64: emptyRoot, DOTNET_MULTILEVEL_LOOKUP: "0" });
    assert.notEqual(missing.code, 0, "The Applet ran without the installed runtime");
    assert.equal(missing.signal, null);
    assert.match(missing.stderr, /install.*\.NET|hostfxr/i);
  } finally {
    fs.rmdirSync(emptyRoot); // The probe root must remain empty.
  }
  const result = { executable, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, frameworks, bundleFiles: bundled.length, installedExit: installed.code, missingRuntimeExit: missing.code };
  fs.writeFileSync(path.join(evidence, "result.json"), JSON.stringify(result, null, 2));
  console.log("PASS shared Desktop Runtime / no bundled runtime / clean EOF / missing-runtime failure", JSON.stringify(result));
})().catch((error) => { console.error(error); process.exitCode = 1; });
