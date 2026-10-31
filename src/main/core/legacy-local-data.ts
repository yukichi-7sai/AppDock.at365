import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LegacyLocalDataState } from '../../shared/legacy-local-data';
import { legacyLocalDataInstructions } from '../../shared/legacy-local-data';
import type { WarningReporter, WarningEpisode } from './warning-reporter';
import type { NotificationInput } from './notification-service';

const legacyNames = ['chromium', 'web-accounts', 'storage', 'secrets', 'web-applets/sessions'];
/** Inspect fixed legacy locations, including empty directories; never read or mutate their contents. */
export function inspectLegacyLocalData(
  base: string,
  shared: string,
  local: string,
): LegacyLocalDataState {
  const state: LegacyLocalDataState = { targets: [], scanFailed: false };
  if (path.resolve(shared).toLowerCase() === path.resolve(local).toLowerCase()) return state;
  for (const root of [shared, path.join(base, '.appdock')]) {
    for (const name of legacyNames) {
      // Shared data/storage is the current Applet Storage root.
      if (root === shared && name === 'storage') continue;
      const target = path.resolve(root, name);
      try {
        fs.lstatSync(target);
        state.targets.push(target);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
          state.scanFailed = true;
      }
    }
  }
  return state;
}

export class LegacyLocalDataMonitor {
  private state: LegacyLocalDataState = { targets: [], scanFailed: false };
  private warning?: { id: string; episode: WarningEpisode };
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(
    private options: {
      inspect(): LegacyLocalDataState;
      warnings: WarningReporter;
      actions: NotificationInput['actions'];
      changed(): void;
    },
  ) {}
  snapshot(): LegacyLocalDataState {
    return structuredClone(this.state);
  }
  refresh = () => {
    if (this.closed) return;
    let next: LegacyLocalDataState;
    try {
      next = this.options.inspect();
    } catch {
      next = { targets: [], scanFailed: true };
    }
    // An unreadable path is not evidence that previously detected data has gone away.
    if (next.scanFailed) next.targets = [...new Set([...this.state.targets, ...next.targets])];
    const changed = JSON.stringify(next) !== JSON.stringify(this.state);
    this.state = next;
    if (next.targets.length || next.scanFailed) {
      this.warning ??= { id: randomUUID(), episode: this.options.warnings.episode() };
      this.warning.episode.update(
        {
          eventId: this.warning.id,
          source: 'storage',
          title: hostText('services.legacyLocalData.title'),
          code: next.scanFailed ? 'LEGACY_LOCAL_DATA_UNREADABLE' : 'LEGACY_LOCAL_DATA',
          message: [
            next.targets.length
              ? hostText('services.legacyLocalData.detected', {
                  count: String(next.targets.length),
                })
              : '',
            next.scanFailed ? hostText('services.legacyLocalData.inaccessible') : '',
            hostText('services.legacyLocalData.detailsHint'),
            legacyLocalDataInstructions,
          ]
            .filter(Boolean)
            .join('\n'),
          logDetails: next.targets.map((target) =>
            hostText('services.legacyLocalData.target', { path: String(target) }),
          ),
        },
        this.options.actions,
      );
    } else {
      this.warning?.episode.resolve();
      this.warning = undefined;
    }
    if (changed) this.options.changed();
  };
  start() {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(this.refresh, 2000);
    this.timer.unref();
  }
  dispose() {
    this.closed = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
