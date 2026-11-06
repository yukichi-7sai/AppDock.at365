import fs from 'node:fs';
import path from 'node:path';
import { session } from 'electron';
import { assetFilename } from '../../shared/asset-names';
import { hostText } from '../../shared/i18n';
import type { CollectionBinding } from '../../shared/page-collections';
import { validPageId } from '../../shared/applet-pages';
import { webAccountGroupId, webAccountId } from '../../shared/web-accounts';
import type { DeviceSettingsStore } from './device-settings-store';

const siteSessions = 'site-sessions';
const collectionKey = (key: string) => validPageId(key) && assetFilename(key);

function ownedDirectory(directory: string) {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  return (
    stat?.isDirectory() &&
    !stat.isSymbolicLink() &&
    fs.realpathSync(directory).toLowerCase() === directory.toLowerCase()
  );
}

function directories(root: string) {
  return ownedDirectory(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
}

function referencedSites(...lists: unknown[]) {
  const ids = new Set<string>();
  for (const list of lists) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) return;
    const listed = new Set<string>();
    for (const site of list) {
      if (!webAccountId(site?.id) || listed.has(site.id)) return;
      listed.add(site.id);
      ids.add(site.id);
    }
  }
  return ids;
}

/** Remote collections derive their account identities from the two saved site lists. */
export class WebSiteAccounts {
  private readonly root: string;
  private readonly opened = new Map<string, Electron.Session>();

  constructor(
    localRoot: string,
    private sources: DeviceSettingsStore['confirmedAppletSources'],
    private failed: (error: Error) => void,
  ) {
    this.root = path.resolve(localRoot, 'web-account-groups');
  }

  session({ owner, key, itemId }: CollectionBinding) {
    const invalidPath = () => Error(hostText('services.webSiteAccounts.invalidPath'));
    if (!webAccountGroupId(owner) || !collectionKey(key) || !webAccountId(itemId))
      throw invalidPath();
    const group = path.join(this.root, owner);
    const sites = path.join(group, siteSessions);
    const collection = path.join(sites, key);
    const target = path.join(collection, itemId);
    const existing = this.opened.get(target);
    if (existing) return existing;
    if (!ownedDirectory(path.dirname(this.root))) throw invalidPath();
    for (const directory of [this.root, group, sites, collection, target]) {
      if (!fs.lstatSync(directory, { throwIfNoEntry: false })) fs.mkdirSync(directory);
      if (!ownedDirectory(directory)) throw invalidPath();
    }
    const value = session.fromPath(target);
    value.setSpellCheckerEnabled(false);
    value.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    value.setPermissionCheckHandler(() => false);
    this.opened.set(target, value);
    return value;
  }

  cleanup(invalidOwners?: ReadonlySet<string>) {
    let deferred = false;
    let sources: ReturnType<DeviceSettingsStore['confirmedAppletSources']>;
    try {
      for (const owner of directories(this.root).filter(webAccountGroupId)) {
        if (invalidOwners?.has(owner)) continue;
        const root = path.join(this.root, owner, siteSessions);
        for (const key of directories(root).filter(collectionKey)) {
          const directory = path.join(root, key);
          const candidates = directories(directory).filter(
            (id) => webAccountId(id) && !this.opened.has(path.join(directory, id)),
          );
          if (!candidates.length) continue;
          sources ??= this.sources();
          if (!sources) return;
          const referenced = referencedSites(
            sources.shared[owner]?.settings[key],
            sources.device[owner]?.configuration?.settings[key],
          );
          if (!referenced) continue;
          for (const id of candidates) {
            const target = path.join(directory, id);
            if (referenced.has(id) || !ownedDirectory(target)) continue;
            try {
              fs.rmSync(target, { recursive: true, force: true });
            } catch {
              deferred = true;
            }
          }
        }
      }
    } catch {
      deferred = true;
    }
    // Electron can hold a session for the lifetime of the process. Its directory is
    // eligible again on the next startup, regardless of whether the Applet is present.
    if (deferred) this.failed(Error(hostText('services.webSiteAccounts.cleanupDeferred')));
  }

  async flush() {
    const results = await Promise.allSettled(
      [...this.opened.values()].map(async (value) => {
        value.flushStorageData();
        await value.cookies.flushStore();
      }),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw Error(hostText('services.webSiteAccounts.saveFailed'));
  }
}
