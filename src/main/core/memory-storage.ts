/** Applet-owned Storage values, scoped to one runtime and never written to disk. */
export class MemoryStorage {
  private values = new Map<string, { value: unknown; version: number; publisher: boolean }>();
  private version = 0;
  get(key: string) {
    return structuredClone(this.values.get(key)?.value ?? null);
  }
  set(key: string, value: unknown, publisher = true) {
    if (value == null) this.values.delete(key);
    else
      this.values.set(key, { value: structuredClone(value), version: ++this.version, publisher });
  }
  reference(key: string, pointer: string, expected: string) {
    const entry = this.values.get(key);
    if (!entry?.publisher || this.resolve(entry.value, pointer) !== expected) return;
    return { version: entry.version, file: expected };
  }
  private resolve(value: unknown, pointer: string): unknown {
    if (!pointer.startsWith('/')) return;
    for (const escaped of pointer.slice(1).split('/')) {
      if (/~(?![01])/u.test(escaped)) return;
      const key = escaped.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return;
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  }
  clear() {
    this.values.clear();
  }
  get size() {
    return this.values.size;
  }
}
