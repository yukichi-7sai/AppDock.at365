import fs from 'node:fs';
import path from 'node:path';
import type { LogCategory, LogEntry } from '../../shared/contracts';
export class HostLog {
  entries: LogEntry[] = [];
  constructor(
    public directory: string,
    private changed: () => void,
  ) {
    fs.mkdirSync(directory, { recursive: true });
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
    try {
      const file = path.join(this.directory, 'host.log');
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
        const previous = file + '.1';
        if (fs.existsSync(previous)) fs.unlinkSync(previous);
        fs.renameSync(file, previous);
      }
      fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      /* File failure must not break extension lifecycle; the log remains visible in memory. */
    }
    this.changed();
  };
}
