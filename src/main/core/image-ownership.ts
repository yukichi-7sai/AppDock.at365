import type { ExtensionManifest, SettingDefinition } from '../../shared/contracts';
import { imageReference, imageKey, type RegisteredImageRef } from '../../shared/registered-images';
import { objectFieldValue } from '../../shared/object-list';
export function ownsImage(
  manifest: ExtensionManifest,
  values: Record<string, unknown>,
  ref: RegisteredImageRef,
) {
  const matches = (definition: SettingDefinition, value: unknown): boolean => {
    if (definition.type === 'registered-image')
      return imageReference(value) && imageKey(value) === imageKey(ref);
    if (definition.type !== 'object-list' || !Array.isArray(value)) return false;
    return value.some(
      (row) =>
        row &&
        typeof row === 'object' &&
        (definition.fields ?? []).some((field) => matches(field, objectFieldValue(row, field))),
    );
  };
  return (manifest.settings ?? []).some((d) =>
    matches(d, values[d.key] === undefined ? d.default : values[d.key]),
  );
}
