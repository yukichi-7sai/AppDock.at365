let language = 'ja';
const refreshers: (() => void)[] = [];

/** Keep shared catalog references stable. Rebuild derived labels in registration order. */
export function localizedMetadata<T extends object>(build: () => T): T {
  const value = build();
  refreshers.push(() => Object.assign(value, build()));
  return value;
}

export function refreshTranslationMetadata(next: string) {
  if (next === language) return;
  language = next;
  for (const refresh of refreshers) refresh();
}
