import { hostText } from './i18n';

/** Empty text clears a category. Omission allows a runtime declaration to inherit it. */
export function commandCategory(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f\x7f]/.test(value))
    throw Error(hostText('commands.category.invalid'));
  return value.trim();
}
