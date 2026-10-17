import { settingsItemId } from '../../shared/settings-catalog';
/** Resolve only a rendered page's declared anchors, never derive the catalog from its DOM. */
export const settingAnchor = (pageId: string, key: string) => ({
  'data-setting-item': settingsItemId(pageId, key),
  tabIndex: -1,
});
