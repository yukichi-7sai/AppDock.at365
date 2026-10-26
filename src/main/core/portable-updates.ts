import { hostText } from '../../shared/i18n';
import { physicalFs } from './physical-fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compareVersions, parseVersion } from '../../shared/versions';
import { validateUpdateSource } from '../../shared/update-sources';
import { readManifest } from './extensions';
import type { UpdateResult, UpdateState, UpdateSettings } from '../../shared/contracts';
import type { AppletPackagePlan } from '../../shared/applet-packages';

const execute = promisify(execFile);
const fs = physicalFs.promises;
const { createReadStream } = physicalFs;
const limit = 512 * 1024 * 1024;
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface UpdateTarget {
  id: string;
  name: string;
  version: string;
  source: string;
  destination: string;
  kind: 'host' | 'applet';
}
interface Feed {
  schemaVersion: 1;
  kind: 'host' | 'applet';
  id: string;
  version: string;
  minimumHostVersion?: string;
  payload: { file: string; sha256: string; size: number; format: 'exe' | 'zip' };
}
interface Candidate {
  target: UpdateTarget;
  feed?: Feed;
  payload?: string;
  directory?: string;
  version: string;
}
const json = (bytes: Buffer) => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
class UpdateHttpError extends Error {
  constructor(readonly status: number) {
    super(hostText('services.portableUpdates.httpError', { status: String(status) }));
  }
}
class UnpublishedRelease extends Error {
  constructor() {
    super(hostText('services.portableUpdates.releaseUnpublished'));
  }
}
export function safeRelative(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length < 512 &&
    !/[\\:\x00-\x1f]/.test(value) &&
    !value.startsWith('/') &&
    value
      .split('/')
      .every(
        (part) =>
          !!part &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  );
}
async function readBounded(
  location: string,
  max: number,
  fetcher: Fetcher,
  signal?: AbortSignal,
  progress?: (received: number) => void,
): Promise<Buffer> {
  const combined = AbortSignal.any([
    AbortSignal.timeout(max <= 1024 * 1024 ? 10000 : 120000),
    ...(signal ? [signal] : []),
  ]);
  combined.throwIfAborted();
  let stream: AsyncIterable<Uint8Array>;
  if (!/^https?:/i.test(location)) {
    const stat = await fs.stat(location);
    if (!stat.isFile() || stat.size > max)
      throw Error(hostText('services.portableUpdates.invalidFile'));
    stream = createReadStream(location, { signal: combined });
  } else {
    const response = await fetcher(location, { signal: combined, redirect: 'follow' });
    if (!response.ok) throw new UpdateHttpError(response.status);
    if (new URL(response.url || location).protocol !== new URL(location).protocol)
      throw Error(hostText('services.portableUpdates.protocolChanged'));
    if (!response.body) throw Error(hostText('services.portableUpdates.emptyPayload'));
    stream = response.body as unknown as AsyncIterable<Uint8Array>;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    combined.throwIfAborted();
    size += chunk.length;
    if (size > max) throw Error(hostText('services.portableUpdates.sizeLimit'));
    chunks.push(Buffer.from(chunk));
    progress?.(size);
  }
  combined.throwIfAborted();
  return Buffer.concat(chunks);
}
function validateFeed(value: any, target: Pick<UpdateTarget, 'id' | 'kind'>): Feed {
  if (value?.schemaVersion !== 1 || value.kind !== target.kind || value.id !== target.id)
    throw Error(hostText('services.portableUpdates.targetMismatch'));
  parseVersion(value.version);
  if (value.minimumHostVersion !== undefined) parseVersion(value.minimumHostVersion);
  const p = value.payload;
  if (
    !p ||
    !safeRelative(p.file) ||
    !/^[a-f0-9]{64}$/i.test(p.sha256) ||
    !Number.isSafeInteger(p.size) ||
    p.size <= 0 ||
    p.size > limit ||
    !(target.kind === 'host' ? ['exe', 'zip'] : ['zip']).includes(p.format)
  )
    throw Error(hostText('services.portableUpdates.invalidPayload'));
  return value;
}
async function resolveFeedSource(
  source: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
  expected?: Pick<UpdateTarget, 'id' | 'kind'>,
) {
  validateUpdateSource(source);
  let location = source;
  let assets: { name: string; browser_download_url: string }[] | undefined;
  const github =
    source.match(/^github:(.+)$/i) ??
    source.match(
      /^https:\/\/github\.com\/([^/]+\/[^/]+)(?:\/releases(?:\/latest|\/tag\/([^/]+))?\/?)?$/i,
    );
  if (github) {
    const endpoint = github[2] ? `tags/${encodeURIComponent(github[2])}` : 'latest';
    let metadata: Buffer;
    try {
      metadata = await readBounded(
        `https://api.github.com/repos/${github[1]}/releases/${endpoint}`,
        1024 * 1024,
        fetcher,
        signal,
      );
    } catch (error) {
      if (error instanceof UpdateHttpError && error.status === 404 && !github[2])
        throw new UnpublishedRelease();
      throw error;
    }
    const release = json(metadata);
    if (release.draft || release.prerelease)
      throw Error(hostText('services.portableUpdates.stableReleaseRequired'));
    assets = release.assets;
    const info = assets?.find((a) => a.name === 'update.json');
    if (!info || !/^https:\/\//i.test(info.browser_download_url))
      throw Error(hostText('services.portableUpdates.feedMissing'));
    location = info.browser_download_url;
  } else if (/^https?:/i.test(source)) {
    if (source.endsWith('/')) location = new URL('update.json', source).href;
  } else if ((await fs.stat(source)).isDirectory()) location = path.join(source, 'update.json');
  const raw = json(await readBounded(location, 1024 * 1024, fetcher, signal));
  if (
    !expected &&
    (typeof raw?.id !== 'string' ||
      !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(raw.id) ||
      !safeRelative(raw.id))
  )
    throw Error(hostText('services.portableUpdates.appletIdMissing'));
  const feed = validateFeed(raw, expected ?? { kind: 'applet', id: raw.id });
  const payload = assets
    ? assets.find((a) => a.name === feed.payload.file)?.browser_download_url
    : /^https?:/i.test(location)
      ? new URL(feed.payload.file, location).href
      : path.join(path.dirname(location), feed.payload.file);
  if (!payload || (assets && !/^https:\/\//i.test(payload)))
    throw Error(hostText('services.portableUpdates.payloadMissing'));
  return { feed, payload, version: feed.version };
}
async function copyTree(
  source: string,
  destination: string,
  signal: AbortSignal,
  progress: (bytes: number) => void,
  budget = { bytes: 0, files: 0 },
) {
  signal.throwIfAborted();
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw Error(hostText('services.portableUpdates.sourceLink'));
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      if (!safeRelative(entry)) throw Error(hostText('services.portableUpdates.invalidFilename'));
      // Generated update packages are distribution metadata, not installed Applet files.
      if (entry === 'update.json' || entry === 'update.zip') continue;
      await copyTree(
        path.join(source, entry),
        path.join(destination, entry),
        signal,
        progress,
        budget,
      );
    }
  } else {
    if (!stat.isFile() || ++budget.files > 10000 || (budget.bytes += stat.size) > limit)
      throw Error(hostText('services.portableUpdates.sourceLimit'));
    await fs.copyFile(source, destination);
    signal.throwIfAborted();
    progress(budget.bytes);
  }
}
async function treeHash(directory: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if ((await fs.lstat(directory)).isSymbolicLink())
    throw Error(hostText('services.portableUpdates.destinationLink'));
  const files: string[] = [];
  async function walk(current: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw Error(hostText('services.portableUpdates.preparedLink'));
      if (entry.isDirectory()) await walk(file);
      else files.push(path.relative(directory, file).replace(/\\/g, '/'));
    }
  }
  await walk(directory);
  const hashes = await Promise.all(
    files.sort().map(
      async (file) =>
        `${file}\0${createHash('sha256')
          .update(await fs.readFile(path.join(directory, file), { signal }))
          .digest('hex')}\n`,
    ),
  );
  return createHash('sha256').update(hashes.join('')).digest('hex');
}
export class PortableUpdates {
  private packagePlans = new Map<
    string,
    {
      preview: AppletPackagePlan;
      temporary: string;
      target: UpdateTarget;
      staged?: string;
      sha256: string;
    }
  >();
  private packagePreview = false;
  private packageOperation?: {
    id: string;
    status: 'preparing' | 'handed-off' | 'failed' | 'completed';
    result?: { ok: boolean; message: string };
  };
  recordPackageResult(result: { operationId?: unknown; ok?: unknown; message?: unknown }) {
    if (typeof result.operationId === 'string' && /^[a-f0-9-]{36}$/i.test(result.operationId))
      this.packageOperation = {
        id: result.operationId,
        status: 'completed',
        result: { ok: result.ok === true, message: String(result.message ?? '') },
      };
  }
  packageStatus(id: unknown) {
    if (typeof id !== 'string')
      throw Error(hostText('services.portableUpdates.invalidOperationId'));
    if (this.state.completion?.operationId === id)
      return { id, status: 'completed', result: this.state.completion };
    return this.packageOperation?.id === id
      ? { ...this.packageOperation }
      : { id, status: this.packagePlans.has(id) ? 'prepared' : 'unknown' };
  }
  get packagesAvailable() {
    return !!this.options.executable;
  }
  canManageApplet(id: string) {
    const target = this.options.targets().find((t) => t.kind === 'applet' && t.id === id);
    return (
      this.packagesAvailable &&
      !!target &&
      path.resolve(path.dirname(target.destination)).toLowerCase() ===
        path.resolve(this.options.baseDirectory, 'extensions').toLowerCase()
    );
  }
  state: UpdateState = { busy: false, phase: '', results: [] };
  private controller?: AbortController;
  private lastCheckedHostSource?: string;
  cancel(): boolean {
    if (!this.state.busy || !this.state.cancellable || !this.controller) return false;
    this.state.cancellable = false;
    this.state.phase = hostText('services.portableUpdates.cancelling');
    this.controller.abort();
    this.options.changed();
    return true;
  }
  constructor(
    private options: {
      targets(): UpdateTarget[];
      settings(): UpdateSettings;
      hostVersion: string;
      helper: string;
      executable: string;
      restartArgs: string[];
      baseDirectory: string;
      stateDirectory?: string;
      fetcher?: Fetcher;
      changed(): void;
      notified?(notice: NonNullable<UpdateState['notice']>, safeMessage: string): void;
      confirm(names: string[]): Promise<boolean>;
      shutdown(): void;
      processIds(): number[];
      log(message: string): void;
      validateApplet?(folder: string): void;
    },
  ) {}
  private get fetcher() {
    return this.options.fetcher ?? fetch;
  }
  private update(result: UpdateResult) {
    this.state.results = [...this.state.results.filter((item) => item.id !== result.id), result];
    this.options.changed();
  }
  private async candidate(
    target: UpdateTarget,
    hostVersion: string,
  ): Promise<Candidate | undefined> {
    const source = target.source.trim();
    validateUpdateSource(source);
    if (!source) return;
    if (
      !/^https?:|^github:/i.test(source) &&
      (await fs.stat(source)).isDirectory() &&
      target.kind === 'applet' &&
      !(await fs.stat(path.join(source, 'update.json')).catch(() => null))
    ) {
      const manifest = json(
        await readBounded(
          path.join(source, 'extension.json'),
          1024 * 1024,
          this.fetcher,
          this.controller?.signal,
        ),
      );
      if (manifest.id !== target.id || manifest.apiVersion !== 1)
        throw Error(hostText('services.portableUpdates.sourceIdMismatch'));
      parseVersion(manifest.version);
      if (
        manifest.minimumHostVersion &&
        compareVersions(manifest.minimumHostVersion, hostVersion) > 0
      )
        throw Error(hostText('services.portableUpdates.hostUpdateRequired'));
      return { target, directory: source, version: manifest.version };
    }
    const candidate = await resolveFeedSource(
      source,
      this.fetcher,
      this.controller?.signal,
      target,
    );
    if (
      candidate.feed.minimumHostVersion &&
      compareVersions(candidate.feed.minimumHostVersion, hostVersion) > 0
    )
      throw Error(hostText('services.portableUpdates.hostUpdateRequired'));
    return { target, ...candidate };
  }
  private async checkTarget(
    target: UpdateTarget,
    hostVersion = this.options.hostVersion,
  ): Promise<{ result: UpdateResult; candidate?: Candidate }> {
    if (target.kind === 'host') this.lastCheckedHostSource = target.source;
    const github =
      target.source.match(/^github:(.+)$/i) ??
      target.source.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)(?:\/releases.*)?$/i);
    const base = {
      id: target.id,
      name: target.name,
      currentVersion: target.version,
      checkedAt: new Date().toISOString(),
      releaseUrl: github ? `https://github.com/${github[1]}/releases` : undefined,
    };
    try {
      const candidate = await this.candidate(target, hostVersion);
      if (!candidate) return { result: { ...base, status: 'unsupported' } };
      const comparison = compareVersions(candidate.version, target.version);
      const installable =
        comparison > 0 || (comparison === 0 && this.options.settings().allowSameVersion);
      return {
        candidate,
        result: {
          ...base,
          status: comparison > 0 ? 'available' : 'current',
          latestVersion: candidate.version,
          installable,
        },
      };
    } catch (error) {
      this.controller?.signal.throwIfAborted();
      return {
        result: {
          ...base,
          status:
            error instanceof UnpublishedRelease
              ? 'unpublished'
              : /先に本体/.test(String(error))
                ? 'incompatible'
                : 'error',
          message: String(error).replace(/^Error: /, ''),
        },
      };
    }
  }
  private begin(phase: string) {
    if (this.state.busy || this.packagePlans.size)
      throw Error(hostText('services.portableUpdates.pendingDialog'));
    this.controller = new AbortController();
    this.state.busy = true;
    this.state.cancellable = true;
    this.state.progress = undefined;
    this.state.completion = undefined;
    this.state.notice = undefined;
    this.state.phase = phase;
    this.options.changed();
  }
  private notice(
    kind: NonNullable<UpdateState['notice']>['kind'],
    message: string,
    safeMessage = message,
  ) {
    this.state.notice = { id: randomUUID(), kind, message };
    try {
      this.options.notified?.(
        this.state.notice,
        kind === 'error' ? hostText('services.portableUpdates.operationFailed') : safeMessage,
      );
    } catch {
      /* Preserve update outcome. */
    }
  }
  private checkedNotice(results: UpdateResult[], notifyCurrent = false) {
    const available = results.filter((result) => result.status === 'available');
    const failed = results.filter(
      (result) => result.status === 'error' || result.status === 'incompatible',
    );
    const skipped = results.filter(
      (result) => result.status === 'unsupported' || result.status === 'unpublished',
    );
    const updates =
      available.length === 1
        ? hostText('services.portableUpdates.availableSingle', {
            name: String(available[0].name),
            version: String(available[0].latestVersion),
          })
        : hostText('services.portableUpdates.availableCount', { count: String(available.length) });
    if (available.length)
      this.notice(
        'available',
        skipped.length
          ? hostText('services.portableUpdates.updatesWithSkipped', {
              updates,
              count: skipped.length,
            })
          : updates,
        skipped.length
          ? hostText('services.portableUpdates.availableWithSkipped', {
              count: available.length,
              skipped: skipped.length,
            })
          : hostText('services.portableUpdates.availableCount', { count: available.length }),
      );
    if (failed.length) {
      const failure = hostText('services.portableUpdates.checkFailures', {
        count: failed.length,
        name: String(failed[0].name),
        message: failed[0].message ?? hostText('services.portableUpdates.checkSource'),
      });
      this.notice(
        'error',
        available.length
          ? hostText('services.portableUpdates.updatesWithFailure', { updates, failure })
          : failure,
      );
    } else if (available.length) return;
    else if (!notifyCurrent) return;
    else if (skipped.length)
      this.notice(
        'info',
        hostText('services.portableUpdates.noUpdatesWithSkipped', {
          count: String(skipped.length),
        }),
      );
    else
      this.notice(
        'info',
        results.length
          ? hostText('services.portableUpdates.upToDate')
          : hostText('services.portableUpdates.noTargets'),
      );
  }
  async checkHostOnAboutOpen(): Promise<void> {
    if (!this.options.settings().checkHostOnAboutOpen || this.state.busy || this.packagePlans.size)
      return;
    const host = this.options.targets().find((target) => target.kind === 'host');
    if (!host?.source.trim()) return;
    const checkedAt = this.state.results.find((result) => result.id === host.id)?.checkedAt;
    const checked = checkedAt ? Date.parse(checkedAt) : NaN;
    if (
      this.lastCheckedHostSource === host.source &&
      Number.isFinite(checked) &&
      Date.now() - checked < 60 * 60 * 1000
    )
      return;
    await this.check([host.id]);
  }
  async check(ids?: string[], silent = false): Promise<UpdateState> {
    this.begin(hostText('services.portableUpdates.checking'));
    try {
      const results: UpdateResult[] = [];
      for (const target of this.options.targets().filter((t) => !ids || ids.includes(t.id))) {
        const { result } = await this.checkTarget(target);
        results.push(result);
        this.update(result);
      }
      if (!silent) this.checkedNotice(results);
      this.state.phase = '';
    } catch (error) {
      if (!this.controller?.signal.aborted) {
        this.notice('error', String(error).replace(/^Error: /, ''));
        throw error;
      }
      this.state.phase = hostText('services.portableUpdates.checkCancelled');
      if (!silent) this.notice('info', this.state.phase);
    } finally {
      this.state.busy = false;
      this.state.cancellable = false;
      this.controller = undefined;
      this.options.changed();
    }
    return structuredClone(this.state);
  }
  async install(scope: string): Promise<UpdateState> {
    this.begin(hostText('services.portableUpdates.preparing'));
    const signal = this.controller!.signal;
    let temporary: string | undefined;
    let handedOff = false;
    try {
      const targets = this.options
        .targets()
        .filter(
          (t) => scope === 'all' || (scope === 'applets' ? t.kind === 'applet' : t.id === scope),
        );
      // Check the host first so Applets can use the version installed in this same transaction.
      if (scope === 'all')
        targets.sort((a, b) => Number(b.kind === 'host') - Number(a.kind === 'host'));
      if (!targets.length) throw Error(hostText('services.portableUpdates.noTargetsForApply'));
      if (!this.options.executable)
        throw Error(hostText('services.portableUpdates.portableRequired'));
      const candidates: Candidate[] = [];
      const results: UpdateResult[] = [];
      let hostVersion = this.options.hostVersion;
      for (const target of targets) {
        signal.throwIfAborted();
        const checked = await this.checkTarget(target, hostVersion);
        results.push(checked.result);
        this.update(checked.result);
        if (checked.candidate && checked.result.installable) {
          candidates.push(checked.candidate);
          if (target.kind === 'host') hostVersion = checked.candidate.version;
        }
      }
      if (!candidates.length) {
        this.state.phase = hostText('services.portableUpdates.noApplicableUpdates');
        this.checkedNotice(results, true);
        return { ...structuredClone(this.state), busy: false, cancellable: false };
      }
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'AppDock-update-'));
      const helper = path.join(temporary, 'AppDock.Updater.exe');
      await fs.copyFile(this.options.helper, helper);
      const items: {
        kind: string;
        id: string;
        version: string;
        source: string;
        destination: string;
        sha256?: string;
        operation?: string;
        previousSha256?: string;
      }[] = [];
      for (const [index, candidate] of candidates.entries()) {
        signal.throwIfAborted();
        this.state.phase = hostText('services.portableUpdates.downloading', {
          name: String(candidate.target.name),
        });
        this.state.progress = {
          id: candidate.target.id,
          name: candidate.target.name,
          index: index + 1,
          count: candidates.length,
          receivedBytes: 0,
          totalBytes: candidate.feed?.payload.size,
        };
        this.options.changed();
        let lastNotice = 0;
        const report = (receivedBytes: number) => {
          this.state.progress!.receivedBytes = receivedBytes;
          if (Date.now() - lastNotice >= 100 || receivedBytes === this.state.progress!.totalBytes) {
            lastNotice = Date.now();
            this.options.changed();
          }
        };
        const staged = path.join(temporary, `payload-${index}`);
        if (candidate.directory) await copyTree(candidate.directory, staged, signal, report);
        else {
          const data = await readBounded(candidate.payload!, limit, this.fetcher, signal, report);
          this.state.phase = hostText('services.portableUpdates.verifying', {
            name: String(candidate.target.name),
          });
          this.options.changed();
          const hash = createHash('sha256').update(data).digest('hex');
          if (
            data.length !== candidate.feed!.payload.size ||
            hash.toLowerCase() !== candidate.feed!.payload.sha256.toLowerCase()
          )
            throw Error(
              hostText('services.portableUpdates.hashMismatch', {
                name: String(candidate.target.name),
              }),
            );
          if (candidate.feed!.payload.format === 'exe')
            await fs.writeFile(staged, data, { flag: 'wx' });
          else {
            const archive = `${staged}.zip`;
            await fs.writeFile(archive, data, { flag: 'wx' });
            await execute(
              helper,
              [candidate.target.kind === 'host' ? '--extract-host' : '--extract', archive, staged],
              {
                windowsHide: true,
                timeout: 120000,
                signal,
              },
            );
          }
        }
        if (candidate.target.kind === 'applet') {
          const m = json(
            await readBounded(
              path.join(staged, 'extension.json'),
              1024 * 1024,
              this.fetcher,
              this.controller?.signal,
            ),
          );
          if (
            m.id !== candidate.target.id ||
            m.version !== candidate.version ||
            m.apiVersion !== 1 ||
            !safeRelative(m.entry)
          )
            throw Error(hostText('services.portableUpdates.manifestMismatch'));
          if (!['node', 'native', 'dotnet'].includes(m.runtime))
            throw Error(hostText('services.portableUpdates.invalidRuntime'));
          if (m.minimumHostVersion && compareVersions(m.minimumHostVersion, hostVersion) > 0)
            throw Error(hostText('services.portableUpdates.requiredHostVersion'));
          await fs.access(path.join(staged, m.entry));
          readManifest(staged);
        } else if (candidate.feed!.payload.format === 'zip') {
          const plan = await execute(
            helper,
            ['--plan-host', staged, this.options.baseDirectory, candidate.version],
            {
              windowsHide: true,
              timeout: 120000,
              maxBuffer: 1024 * 1024,
              signal,
            },
          );
          items.push(...JSON.parse(plan.stdout));
          continue;
        } else {
          const header = await fs.readFile(staged);
          if (header[0] !== 0x4d || header[1] !== 0x5a)
            throw Error(hostText('services.portableUpdates.exeRequired'));
        }
        items.push({
          kind: candidate.target.kind,
          id: candidate.target.id,
          version: candidate.version,
          source: staged,
          destination: candidate.target.destination,
          sha256:
            candidate.target.kind === 'host'
              ? candidate.feed!.payload.sha256
              : await treeHash(staged, signal),
        });
      }
      signal.throwIfAborted();
      this.state.cancellable = false;
      this.state.progress = undefined;
      this.state.phase = hostText('services.portableUpdates.awaitingConfirmation');
      this.options.changed();
      if (
        !(await this.options.confirm(
          candidates.map((c) => `${c.target.name} ${c.target.version} → ${c.version}`),
        ))
      ) {
        this.state.phase = hostText('services.portableUpdates.cancelled');
        this.notice('info', this.state.phase);
        return { ...structuredClone(this.state), busy: false, cancellable: false };
      }
      this.state.phase = hostText('services.portableUpdates.preparingRestart');
      this.options.changed();
      const jobItems = await Promise.all(
        items.map(async (item) =>
          item.operation
            ? item
            : {
                ...item,
                operation: 'update',
                previousSha256:
                  item.kind === 'host'
                    ? createHash('sha256')
                        .update(await fs.readFile(item.destination))
                        .digest('hex')
                    : await treeHash(item.destination),
              },
        ),
      );
      await this.handoff(temporary, jobItems);
      handedOff = true;
      this.state.phase = hostText('services.portableUpdates.applying');
      this.options.changed();
      this.options.shutdown();
      return structuredClone(this.state);
    } catch (error) {
      if (signal.aborted) {
        this.state.phase = hostText('services.portableUpdates.cancelledUnchanged');
        this.notice('info', this.state.phase);
      } else {
        this.state.phase = String(error).replace(/^Error: /, '');
        this.notice('error', this.state.phase);
        throw error;
      }
    } finally {
      if (!handedOff) {
        if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
        this.state.busy = false;
        this.state.cancellable = false;
        this.state.progress = undefined;
        this.controller = undefined;
        this.options.changed();
      }
    }
    return structuredClone(this.state);
  }
  cancelPackagePreview() {
    return this.packagePreview ? this.cancel() : false;
  }
  async discardPackagePlan(id: unknown) {
    if (typeof id !== 'string') return;
    const plan = this.packagePlans.get(id);
    if (!plan) return;
    this.packagePlans.delete(id);
    await fs.rm(plan.temporary, { recursive: true, force: true });
  }
  async discardPackagePlans() {
    this.cancelPackagePreview();
    await Promise.all([...this.packagePlans.keys()].map((id) => this.discardPackagePlan(id)));
  }
  private finishPreview() {
    this.packagePreview = false;
    this.controller = undefined;
    this.state.busy = false;
    this.state.cancellable = false;
    this.state.phase = '';
    this.state.progress = undefined;
    this.options.changed();
  }
  private async assertNewApplet(id: string) {
    if (
      !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) ||
      !safeRelative(id) ||
      id === 'appdock.default-shell'
    )
      throw Error(hostText('services.portableUpdates.invalidInstallId'));
    const root = path.join(this.options.baseDirectory, 'extensions');
    if (
      this.options.targets().some((t) => t.id === id) ||
      (await fs.lstat(path.join(root, id)).catch(() => null))
    )
      throw Error(hostText('services.portableUpdates.alreadyInstalled'));
    for (const dir of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!dir.isDirectory() || dir.name === '.transactions') continue;
      const file = path.join(root, dir.name, 'extension.json');
      const m = await readBounded(file, 1024 * 1024, this.fetcher)
        .then(json)
        .catch(() => undefined);
      if (m?.id === id) throw Error(hostText('services.portableUpdates.duplicateInstallFolder'));
    }
  }
  async prepareAppletInstall(input: unknown): Promise<AppletPackagePlan | undefined> {
    if (!this.packagesAvailable)
      throw Error(hostText('services.portableUpdates.portableInstallRequired'));
    if (typeof input !== 'string' || !input.trim())
      throw Error(hostText('services.portableUpdates.sourceRequired'));
    const source = input.trim();
    validateUpdateSource(source);
    if (this.state.busy) throw Error(hostText('services.portableUpdates.packageBusy'));
    await this.discardPackagePlans();
    this.begin(hostText('services.portableUpdates.retrievingApplet'));
    this.packagePreview = true;
    const signal = this.controller!.signal;
    let temporary: string | undefined;
    try {
      let directory: string | undefined;
      if (!/^https?:|^github:/i.test(source)) {
        const sourceStat = await fs.lstat(source);
        if (sourceStat.isSymbolicLink())
          throw Error(hostText('services.portableUpdates.distributionLink'));
        if (
          sourceStat.isDirectory() &&
          !(await fs.lstat(path.join(source, 'update.json')).catch(() => undefined))
        )
          directory = source;
      }
      const candidate = directory
        ? undefined
        : await resolveFeedSource(source, this.fetcher, signal);
      const original = directory ? readManifest(directory) : candidate!.feed;
      await this.assertNewApplet(original.id);
      if (
        original.minimumHostVersion &&
        compareVersions(original.minimumHostVersion, this.options.hostVersion) > 0
      )
        throw Error(hostText('services.portableUpdates.hostUpdateRequired'));
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'AppDock-update-'));
      const helper = path.join(temporary, 'AppDock.Updater.exe');
      await fs.copyFile(this.options.helper, helper);
      const staged = path.join(temporary, 'payload');
      if (directory) await copyTree(directory, staged, signal, () => {});
      else {
        const bytes = await readBounded(candidate!.payload, limit, this.fetcher, signal);
        if (
          bytes.length !== candidate!.feed.payload.size ||
          createHash('sha256').update(bytes).digest('hex') !==
            candidate!.feed.payload.sha256.toLowerCase()
        )
          throw Error(hostText('services.portableUpdates.distributionHash'));
        const archive = path.join(temporary, 'package.zip');
        await fs.writeFile(archive, bytes, { flag: 'wx' });
        await execute(helper, ['--extract', archive, staged], {
          windowsHide: true,
          timeout: 120000,
          signal,
        });
      }
      const m = readManifest(staged);
      if (m.id !== original.id || m.version !== original.version || !safeRelative(m.entry))
        throw Error(hostText('services.portableUpdates.distributionManifest'));
      if (
        m.minimumHostVersion &&
        compareVersions(m.minimumHostVersion, this.options.hostVersion) > 0
      )
        throw Error(hostText('services.portableUpdates.requiredInstallHost'));
      this.options.validateApplet?.(staged);
      signal.throwIfAborted();
      const preview: AppletPackagePlan = {
        planId: randomUUID(),
        operation: 'install',
        id: m.id,
        name: m.displayName ?? m.name,
        version: m.version,
        runtime: m.runtime,
        minimumHostVersion: m.minimumHostVersion,
        updateSource: m.updateRepository ? `github:${m.updateRepository}` : '',
      };
      const target: UpdateTarget = {
        id: m.id,
        name: preview.name,
        version: m.version,
        source,
        kind: 'applet',
        destination: path.join(this.options.baseDirectory, 'extensions', m.id),
      };
      this.packagePlans.set(preview.planId, {
        preview,
        temporary,
        target,
        staged,
        sha256: await treeHash(staged, signal),
      });
      temporary = undefined;
      return preview;
    } catch (error) {
      if (!signal.aborted) throw error;
      return undefined;
    } finally {
      if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
      this.finishPreview();
    }
  }
  async prepareAppletUninstall(id: unknown): Promise<AppletPackagePlan> {
    if (typeof id !== 'string' || !this.canManageApplet(id))
      throw Error(hostText('services.portableUpdates.uninstallForbidden'));
    if (this.state.busy) throw Error(hostText('services.portableUpdates.packageBusy'));
    await this.discardPackagePlans();
    this.begin(hostText('services.portableUpdates.checkingRemoval'));
    this.packagePreview = true;
    let temporary: string | undefined;
    try {
      const target = this.options.targets().find((t) => t.id === id)!;
      const manifest = readManifest(target.destination);
      if (manifest.id !== target.id || manifest.version !== target.version)
        throw Error(hostText('services.portableUpdates.targetChanged'));
      const sha256 = await treeHash(target.destination, this.controller!.signal);
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'AppDock-update-'));
      await fs.copyFile(this.options.helper, path.join(temporary, 'AppDock.Updater.exe'));
      const preview: AppletPackagePlan = {
        planId: randomUUID(),
        operation: 'uninstall',
        id,
        name: target.name,
        version: target.version,
      };
      this.packagePlans.set(preview.planId, { preview, target: { ...target }, temporary, sha256 });
      temporary = undefined;
      return preview;
    } finally {
      if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
      this.finishPreview();
    }
  }
  async applyAppletPackage(id: unknown) {
    if (typeof id !== 'string') throw Error(hostText('services.portableUpdates.invalidPlan'));
    const plan = this.packagePlans.get(id);
    if (!plan) throw Error(hostText('services.portableUpdates.stalePlan'));
    if (this.state.busy) throw Error(hostText('services.portableUpdates.packageBusy'));
    this.packagePlans.delete(id);
    this.begin(hostText('services.portableUpdates.preparingRestart'));
    this.packageOperation = { id, status: 'preparing' };
    let handedOff = false;
    try {
      const { preview, target } = plan;
      if (preview.operation === 'install') {
        await this.assertNewApplet(target.id);
        this.options.validateApplet?.(plan.staged!);
        if ((await treeHash(plan.staged!)) !== plan.sha256)
          throw Error(hostText('services.portableUpdates.preparedChanged'));
      } else {
        if (
          !this.canManageApplet(target.id) ||
          (await treeHash(target.destination)) !== plan.sha256
        )
          throw Error(hostText('services.portableUpdates.removalTargetChanged'));
      }
      this.state.cancellable = false;
      await this.handoff(
        plan.temporary,
        [
          {
            operation: preview.operation,
            kind: 'applet',
            id: target.id,
            version: target.version,
            destination: target.destination,
            source: plan.staged,
            sha256: plan.staged ? plan.sha256 : undefined,
            previousSha256: preview.operation === 'uninstall' ? plan.sha256 : undefined,
          },
        ],
        2,
        id,
      );
      handedOff = true;
      this.packageOperation = { id, status: 'handed-off' };
      this.options.shutdown();
      return structuredClone(this.state);
    } catch (error) {
      this.packageOperation = { id, status: 'failed' };
      this.notice('error', hostText('services.portableUpdates.packageFailed'));
      throw error;
    } finally {
      if (!handedOff) {
        await fs.rm(plan.temporary, { recursive: true, force: true }).catch(() => {});
        this.finishPreview();
      }
    }
  }
  private async handoff(
    temporary: string,
    items: unknown[],
    schemaVersion = 2,
    operationId: string = randomUUID(),
  ) {
    const helper = path.join(temporary, 'AppDock.Updater.exe');
    const job = {
      schemaVersion,
      operationId,
      baseDirectory: this.options.baseDirectory,
      executable: this.options.executable,
      args: this.options.restartArgs,
      processIds: this.options.processIds(),
      items,
      stateDirectory: this.options.stateDirectory,
      result: path.join(
        this.options.stateDirectory || path.join(this.options.baseDirectory, 'data'),
        'update-result.json',
      ),
    };
    const jobPath = path.join(temporary, 'job.json');
    await fs.writeFile(jobPath, JSON.stringify(job));
    const child = spawn(helper, ['--apply', jobPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    let failure: Error | undefined;
    child.once('error', (error) => {
      failure = error;
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failure) throw failure;
      if (await fs.stat(`${jobPath}.ready`).catch(() => null)) break;
      if (child.exitCode !== null || attempt === 99)
        throw Error(hostText('services.portableUpdates.updaterStartFailed'));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Commit only after the helper validated the entire job. No payload may be applied before this marker.
    await fs.writeFile(`${jobPath}.commit`, 'apply');
    child.unref();
  }
  scheduleStartup(
    smoke: boolean,
    notify: (results: UpdateResult[]) => void,
  ): ReturnType<typeof setTimeout> | undefined {
    const settings = this.options.settings();
    const ids = this.options
      .targets()
      .filter((t) =>
        t.kind === 'host' ? settings.checkHostOnStartup : settings.checkAppletsOnStartup,
      )
      .map((t) => t.id);
    if (smoke || !ids.length) return;
    return setTimeout(() => {
      const current = this.options.settings();
      const currentIds = this.options
        .targets()
        .filter((target) =>
          target.kind === 'host' ? current.checkHostOnStartup : current.checkAppletsOnStartup,
        )
        .map((target) => target.id);
      void this.check(currentIds, true)
        .then(() => {
          if (this.options.settings().notifyOnStartup)
            notify(
              this.state.results.filter(
                (r) => r.status === 'available' && currentIds.includes(r.id!),
              ),
            );
        })
        .catch((error) => this.options.log(String(error)));
    }, settings.startupDelaySeconds * 1000);
  }
}
