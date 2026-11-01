import type { ExtensionManifest, SettingDefinition, Settings } from '../../shared/contracts';
import { imageReference } from '../../shared/registered-images';
import { setObjectField } from '../../shared/object-list';
import { AssignedAssets } from './assigned-assets';
export class AssignedImages extends AssignedAssets {
  prepare(next: Settings, previous: Settings, manifests: ExtensionManifest[]): Settings {
    const retain = (value: unknown, old: unknown) =>
      imageReference(value) && JSON.stringify(value) !== JSON.stringify(old)
        ? this.retain(value)
        : value;
    // Ribbon structures own their image fields. Other arbitrary JSON is not an image setting.
    const ribbon = (value: any, old: any): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++)
          ribbon(
            value[i],
            value[i]?.id ? old?.find?.((item: any) => item.id === value[i].id) : old?.[i],
          );
      } else
        for (const key of Object.keys(value)) {
          if (key === 'image') value[key] = retain(value[key], old?.[key]);
          else ribbon(value[key], old?.[key]);
        }
    };
    ribbon(next.ribbon, previous.ribbon);
    const fields = (definitions: SettingDefinition[], value: any, old: any) => {
      if (!value || typeof value !== 'object') return;
      for (const definition of definitions) {
        const stored = (input: any) =>
          (definition.propertyPath ?? [definition.key]).reduce(
            (entry, key) =>
              entry && typeof entry === 'object' && Object.hasOwn(entry, key)
                ? entry[key]
                : undefined,
            input,
          );
        const current = stored(value),
          previous = stored(old);
        if (definition.type === 'registered-image' && current !== undefined)
          setObjectField(value, definition, retain(current, previous));
        if (definition.type === 'object-list' && Array.isArray(current))
          for (const [i, row] of current.entries())
            fields(
              definition.fields ?? [],
              row,
              row?.id ? previous?.find?.((entry: any) => entry.id === row.id) : previous?.[i],
            );
      }
    };
    for (const manifest of manifests)
      fields(
        manifest.settings ?? [],
        next.extensions[manifest.id]?.settings,
        previous.extensions[manifest.id]?.settings,
      );
    return next;
  }
}
