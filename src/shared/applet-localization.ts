export interface AppletLocalizationDeclaration {
  defaultLanguage: string;
}
export interface AppletLocalizationSnapshot {
  language: string;
  defaultLanguage: string;
  messages: Record<string, string>;
}
export type AppletTextValues = Record<string, string | number>;
export interface AppletLocalizationApi {
  readonly language: string;
  snapshot(): AppletLocalizationSnapshot;
  t(key: string, values?: AppletTextValues): string;
  onChanged(callback: () => unknown | Promise<unknown>): () => void;
}
export interface AppletLocalizationPageApi {
  snapshot(): Promise<AppletLocalizationSnapshot>;
  t(key: string, values?: AppletTextValues): Promise<string>;
  onChanged(callback: (snapshot: AppletLocalizationSnapshot) => void): () => void;
}
export function appletText(
  snapshot: AppletLocalizationSnapshot,
  key: string,
  values: AppletTextValues = {},
): string {
  const template = Object.hasOwn(snapshot.messages, key) ? snapshot.messages[key] : key;
  return template.replace(/{{([^{}]+)}}/g, (token, name: string) =>
    Object.hasOwn(values, name) && ['string', 'number'].includes(typeof values[name])
      ? String(values[name])
      : token,
  );
}
export function translationPlaceholders(value: string) {
  return [...new Set(value.match(/{{[^{}]+}}/g))].sort().join('\n');
}
export function appletTranslationKey(value: unknown): string | undefined {
  return typeof value === 'string'
    ? /^%([a-zA-Z0-9][a-zA-Z0-9._-]*)%$/.exec(value)?.[1]
    : undefined;
}
