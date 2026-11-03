// Vite uses this module instead of the filesystem loader in both local UI bundles.
import { refreshTranslationMetadata } from '../shared/translation-metadata';
import type { AppearanceSnapshot } from '../shared/appearance';
export const hostResources = await window.appdockAppearance.translations();
let language = 'ja';
let revision = -1;
function receive(value: AppearanceSnapshot) {
  if (value.revision <= revision) return;
  revision = value.revision;
  language = value.language ?? 'ja';
  refreshTranslationMetadata(language);
}
window.appdockAppearance.onChanged(receive);
receive(await window.appdockAppearance.snapshot());
export const readHostLanguage = () => language;
