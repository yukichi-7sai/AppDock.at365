/** Share source snapshots only within one synchronous settings-model read. */
export class SettingsReadScope {
  private values?: Map<string, unknown>;
  run<T>(read: () => T): T {
    if (this.values) return read();
    this.values = new Map();
    try {
      return read();
    } finally {
      this.values = undefined;
    }
  }
  once<T>(key: string, read: () => T): T {
    if (!this.values) return read();
    if (!this.values.has(key)) this.values.set(key, read());
    return this.values.get(key) as T;
  }
}
