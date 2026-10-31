import fs from 'node:fs';
import path from 'node:path';
import type { LogCategory, LogEntry } from '../../shared/contracts';
import type { LogStorageState } from '../../shared/host-pages';
export class HostLog {
  entries: LogEntry[] = [];
  private mode: LogStorageState['mode'] = 'shared';
  directory: string;
  constructor(
    private sharedDirectory: string,
    private changed: () => void,
    private fallbackDirectory?: string,
  ) {
    this.directory = sharedDirectory;
  }
  storage(): LogStorageState {
    return { mode: this.mode, directory: this.directory };
  }
  private append(directory: string, entry: LogEntry) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'host.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
      const previous = file + '.1';
      if (fs.existsSync(previous)) fs.unlinkSync(previous);
      fs.renameSync(file, previous);
    }
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  }
  audit = (level: string, source: string, message: string) =>
    this.write(level, source, message, 'audit');
  write = (level: string, source: string, message: string, category: LogCategory = 'normal') => {
    const entry = {
      time: new Date().toISOString(),
      level,
      category,
      source,
      message: String(message).slice(0, 4000),
    };
    this.entries.push(entry);
    if (this.entries.length > 500) this.entries.shift();
    this.mode = 'memory';
    for (const [directory, mode] of [
      [this.sharedDirectory, 'shared'],
      [this.fallbackDirectory, 'local'],
    ] as const) {
      if (!directory) continue;
      try {
        this.append(directory, entry);
        this.directory = directory;
        this.mode = mode;
        break;
      } catch {
        // Retry the shared location on the next entry; never replay or move older logs.
        // Both destinations may fail without breaking Applet lifecycle or recursive logging.
      }
    }
    this.changed();
  };
}
