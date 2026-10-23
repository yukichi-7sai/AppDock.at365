import { hostText } from './i18n';
import type { ExtensionManifest } from './contracts';
import { validPageId } from './applet-pages';
import { ribbonGroupIcons, type AppletRibbonItem } from './ribbon';
export function parseRibbonItems(manifest: ExtensionManifest): AppletRibbonItem[] | undefined {
  if (manifest.ribbonItems === undefined) return;
  if (
    !manifest.capabilities?.includes('ribbon-items') ||
    !Array.isArray(manifest.ribbonItems) ||
    manifest.ribbonItems.length > 16
  )
    throw Error(hostText('services.sharedRibbonItems.capabilityLimit'));
  const ids = new Set<string>();
  return manifest.ribbonItems.map((item) => {
    if (
      !item ||
      Object.keys(item).some(
        (k) =>
          ![
            'id',
            'title',
            'action',
            'icon',
            'imageSetting',
            'imageShape',
            'iconOnly',
            'defaultPlacement',
          ].includes(k),
      ) ||
      !validPageId(item.id) ||
      ids.has(item.id) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(item.title) ||
      item.action !== 'settings' ||
      !manifest.capabilities?.includes('settings') ||
      (item.icon !== undefined && !ribbonGroupIcons.includes(item.icon)) ||
      (item.imageSetting !== undefined &&
        !manifest.settings?.some(
          (s) => s.key === item.imageSetting && s.type === 'registered-image',
        )) ||
      (item.imageShape !== undefined && !['square', 'circle'].includes(item.imageShape)) ||
      (item.iconOnly !== undefined && typeof item.iconOnly !== 'boolean') ||
      (item.defaultPlacement !== undefined && !['top', 'bottom'].includes(item.defaultPlacement))
    )
      throw Error(hostText('services.sharedRibbonItems.invalidDeclaration'));
    ids.add(item.id);
    return { ...item, title: item.title.trim() };
  });
}
