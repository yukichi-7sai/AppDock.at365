const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const executableName = 'AppDock.at365.exe';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (parent, child) =>
  path
    .resolve(child)
    .toLowerCase()
    .startsWith(path.resolve(parent).toLowerCase() + path.sep);

function plainTree(directory) {
  if (!fs.existsSync(directory)) return;
  if (fs.lstatSync(directory).isSymbolicLink())
    throw Error('Test runtime contains a reparse point');
  if (fs.statSync(directory).isDirectory())
    for (const entry of fs.readdirSync(directory)) plainTree(path.join(directory, entry));
}

function validateEntries(entries, executable = executableName) {
  if (
    !Array.isArray(entries) ||
    !entries.includes(executable) ||
    new Set(entries.map((entry) => String(entry).toLowerCase())).size !== entries.length ||
    entries.some(
      (entry) =>
        typeof entry !== 'string' ||
        !entry ||
        path.basename(entry) !== entry ||
        /[\\/:]|[. ]$/.test(entry) ||
        ['.', '..', 'settings.json', 'data', 'extensions'].includes(entry.toLowerCase()),
    )
  )
    throw Error('Unsafe host fixture manifest');
  return entries;
}

function managedEntries(directory) {
  const manifest = path.join(directory, 'appdock-host.json');
  const entries = fs.existsSync(manifest)
    ? JSON.parse(fs.readFileSync(manifest, 'utf8')).entries
    : [executableName];
  return validateEntries(entries);
}

function plainParents(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw Error('Test profile parent is a reparse point');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (path.dirname(current) === current) break;
  }
}

function snapshot(directory, entries) {
  const files = [];
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('Host fixture contains a reparse point');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
    } else if (stat.isFile()) {
      files.push({
        file: path.relative(directory, file).replaceAll('\\', '/'),
        size: stat.size,
        sha256: digest(fs.readFileSync(file)),
      });
    } else throw Error('Unsupported host fixture entry');
  }
  for (const entry of [...entries].sort()) visit(path.join(directory, entry));
  return { fingerprint: digest(JSON.stringify(files)), files };
}

function activeProcesses(directory) {
  if (process.platform !== 'win32') throw Error('Test runtime process checks require Windows');
  const prefix = (path.resolve(directory) + path.sep).replaceAll("'", "''");
  const output = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference='Stop'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${prefix}', [StringComparison]::OrdinalIgnoreCase) } | Select-Object -ExpandProperty ProcessId)`,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(output.trim() || '[]');
}

class TestHostRuntime {
  constructor(artifacts, processes = activeProcesses, options = {}) {
    this.artifacts = path.resolve(artifacts);
    this.directory = path.join(this.artifacts, 'test-runtime');
    this.slot = options.slot || 'host';
    this.executableName = options.executableName || executableName;
    if (
      !/^[a-z0-9-]+$/.test(this.slot) ||
      path.basename(this.executableName) !== this.executableName ||
      /[\\/:]|[. ]$/.test(this.executableName)
    )
      throw Error('Invalid test runtime identity');
    this.native = options.native === true;
    this.host = path.join(this.directory, this.slot);
    this.path = path.join(this.host, this.executableName);
    this.lock = path.join(this.directory, this.slot + '.lock');
    this.metadata = this.slot === 'host' ? 'test-runtime.json' : this.slot + '-runtime.json';
    this.processes = processes;
  }

  validateProfile(profile, artifacts) {
    artifacts = path.resolve(artifacts);
    profile = path.resolve(profile);
    if (
      (!samePath(artifacts, this.artifacts) &&
        path.basename(artifacts).toLowerCase() !== '.artifacts') ||
      !inside(artifacts, profile) ||
      samePath(profile, this.directory) ||
      inside(this.directory, profile)
    )
      throw Error('Test profile must be separate from the shared runtime and inside .artifacts');
    plainParents(profile);
    return { profile, artifacts };
  }

  executable(profile, artifacts = this.artifacts) {
    ({ profile, artifacts } = this.validateProfile(profile, artifacts));
    this.profile = profile;
    this.profileArtifacts = artifacts;
    if (this.evidence) this.record(profile, artifacts);
    return this.path;
  }

  ensureIdle() {
    const running = this.processes(this.host);
    if (!Array.isArray(running) || running.length)
      throw Error('Shared test runtime is still running; stop its test before replacing it');
  }

  acquire() {
    if (this.owner) return;
    // Check the absolute parent paths before creating, copying or removing anything.
    for (const directory of [this.artifacts, this.directory])
      if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
        throw Error('Test runtime parent is a reparse point');
    fs.mkdirSync(this.directory, { recursive: true });
    plainTree(this.directory);
    if (fs.existsSync(this.lock)) {
      const previous = fs.readFileSync(this.lock, 'utf8');
      const { pid } = JSON.parse(previous);
      if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid test runtime owner');
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        alive = false;
      }
      if (alive) throw Error(`Shared test runtime is owned by PID ${pid}; run GUI tests serially`);
      this.ensureIdle();
      if (fs.readFileSync(this.lock, 'utf8') !== previous)
        throw Error('Test runtime owner changed');
      fs.unlinkSync(this.lock);
    }
    this.owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
    try {
      fs.writeFileSync(this.lock, this.owner, { flag: 'wx' });
    } catch (error) {
      this.owner = undefined;
      throw error;
    }
    try {
      this.ensureIdle();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  copy(source, copyDistribution) {
    source = path.resolve(source);
    if (!fs.existsSync(source)) {
      const unpacked = path.join(path.dirname(source), 'win-unpacked', path.basename(source));
      if (fs.existsSync(unpacked)) source = unpacked;
    }
    if (inside(this.directory, source)) throw Error('Test runtime cannot be its own source');
    const sourceDirectory = path.dirname(source);
    const entries = this.native
      ? validateEntries(fs.readdirSync(sourceDirectory), this.executableName)
      : managedEntries(sourceDirectory);
    const input = snapshot(sourceDirectory, entries);
    this.acquire();
    const stateFile = path.join(this.directory, this.slot + '.json');
    const previous = fs.existsSync(stateFile)
      ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      : undefined;
    plainTree(this.host);
    const oldEntries =
      this.native && previous?.files
        ? validateEntries(
            [...new Set(previous.files.map((file) => file.file.split('/')[0]))],
            this.executableName,
          )
        : fs.existsSync(path.join(this.host, 'appdock-host.json'))
          ? managedEntries(this.host)
          : entries;
    const allowed = new Set([...oldEntries, ...entries]);
    if (fs.existsSync(this.host))
      for (const entry of fs.readdirSync(this.host))
        if (!allowed.has(entry)) throw Error(`Unexpected file in test runtime: ${entry}`);
    let current;
    if (previous?.fingerprint === input.fingerprint && fs.existsSync(this.path)) {
      try {
        current = snapshot(this.host, entries);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (current?.fingerprint !== input.fingerprint) {
      this.ensureIdle();
      plainTree(this.host);
      if (fs.existsSync(this.host)) {
        for (const entry of fs.readdirSync(this.host)) {
          const target = path.resolve(this.host, entry);
          if (path.dirname(target) !== this.host || !target.startsWith(this.directory + path.sep))
            throw Error('Unsafe test runtime cleanup path');
          fs.rmSync(target, { recursive: true, force: true });
        }
      }
      fs.mkdirSync(this.host, { recursive: true });
      if (this.native) copyDistribution(source, this.path, entries);
      else copyDistribution(source, this.path);
      current = snapshot(this.host, entries);
      if (current.fingerprint !== input.fingerprint) throw Error('Test runtime copy hash mismatch');
      fs.writeFileSync(stateFile, JSON.stringify(current, null, 2) + '\n');
    }
    this.evidence = { executable: this.path, source, ...input };
    this.manifest = fs.existsSync(path.join(sourceDirectory, 'appdock-host.json'))
      ? fs.readFileSync(path.join(sourceDirectory, 'appdock-host.json'))
      : undefined;
    if (this.profile) this.record(this.profile, this.profileArtifacts);
  }

  record(profile, artifacts = this.artifacts) {
    ({ profile } = this.validateProfile(profile, artifacts));
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, this.metadata),
      JSON.stringify(this.evidence, null, 2) + '\n',
    );
    if (this.manifest) fs.writeFileSync(path.join(profile, 'appdock-host.json'), this.manifest);
  }

  close() {
    if (this.owner && fs.existsSync(this.lock) && fs.readFileSync(this.lock, 'utf8') === this.owner)
      fs.unlinkSync(this.lock);
    this.owner = undefined;
  }
}

module.exports = { TestHostRuntime, managedEntries };
