const inputs = new Set<() => Promise<void>>();
export function registerSettingsInputs(flush: () => Promise<void>) {
  inputs.add(flush);
  return () => {
    inputs.delete(flush);
  };
}
export async function flushSettingsPageInputs() {
  await Promise.all([...inputs].map((flush) => flush()));
}
