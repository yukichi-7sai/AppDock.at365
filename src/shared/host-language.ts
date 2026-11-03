/** Host UI languages are independent of regional formats, time zones and Web sessions. */
import { hostResources, readHostLanguage } from '#host-translations';
export const hostLanguages = Object.keys(hostResources);
export type HostLanguage = string;
export const defaultHostLanguage: HostLanguage = 'ja';
export function isHostLanguage(value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(hostResources, value);
}
export function validHostLanguageCode(value: unknown): value is string {
  if (isHostLanguage(value)) return true;
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return false;
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}
export function effectiveHostLanguage(value = readHostLanguage()): HostLanguage {
  return isHostLanguage(value) ? value : defaultHostLanguage;
}
export function hostLanguageName(code: string) {
  return code === 'ja'
    ? hostResources.ja['language.ja']
    : (new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code);
}
