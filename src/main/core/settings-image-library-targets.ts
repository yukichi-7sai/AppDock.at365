import { createHash, randomUUID } from 'node:crypto';
import type { SettingDefinition } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import {
  imageFilename,
  imageKey,
  type ImageLibrary,
  type ImageGroup,
  type RegisteredImageRef,
} from '../../shared/registered-images';
import { ImageLibrarySettingsError, type ImageLibrarySettings } from './image-library-settings';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';

const safeError = (error: unknown, code = 'INVALID_ARGUMENT'): never => {
  if (error instanceof SettingsTargetError) throw error;
  if (error instanceof ImageLibrarySettingsError) code = error.code;
  throw new SettingsTargetError(
    code,
    hostText(
      code === 'REVISION_CONFLICT'
        ? 'services.settingsCommands.refreshChanges'
        : code === 'INVALID_ARGUMENT'
          ? 'services.settingsTargets.invalid'
          : 'services.settingsTargets.failed',
    ),
  );
};

/** Fixed settings entries project classification. Import, decoding and file deletion are separate. */
export function imageLibrarySettingsTargets(options: {
  owner: ImageLibrarySettings;
  references(): RegisteredImageRef[];
  checkRevision(revision: string): void;
}): SettingsListTarget[] {
  const { owner } = options;
  let snapshot: ImageLibrary = { groups: [] },
    available = true;
  try {
    snapshot = owner.snapshot();
  } catch {
    available = false;
  }
  const library = () => {
    try {
      return owner.snapshot();
    } catch {
      return { groups: [] };
    }
  };
  const guard = () => ({ $guard: owner.revision });
  const plan = (next: ImageLibrary, revision: string) => {
    options.checkRevision(revision);
    let result: ReturnType<ImageLibrarySettings['plan']>;
    try {
      result = owner.plan(next, owner.revision);
    } catch (error) {
      return safeError(error);
    }
    return {
      changed: result.changed ? ['groups'] : [],
      before: {},
      values: {},
      applies: { groups: 'imageLibraryChanged' },
      commit: (preflight?: () => void) => {
        options.checkRevision(revision);
        try {
          result.commit(preflight);
        } catch (error) {
          safeError(error, 'SAVE_FAILED');
        }
      },
    };
  };
  const fields: SettingDefinition[] = [
    { key: 'id', title: hostText('settings.imageLibrary.id'), type: 'string', maxLength: 80 },
    {
      key: 'name',
      title: hostText('settings.imageLibrary.name'),
      type: 'string',
      minLength: 1,
      maxLength: 80,
    },
  ];
  const groups: SettingsListTarget = {
    kind: 'list',
    targetId: 'service.image-library.groups',
    ownerId: 'appdock',
    category: 'image-library',
    title: hostText('settings.imageLibrary.groups'),
    available,
    fields,
    definition: {
      key: 'groups',
      title: hostText('settings.imageLibrary.groups'),
      type: 'object-list',
      fields,
      list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
    },
    rows: () => library().groups.map((group) => ({ ...group })),
    overrides: guard,
    writable: (field) => available && field.key === 'name',
    applies: () => 'imageLibraryChanged',
    createRow: () => ({ id: randomUUID(), name: '', images: [] }),
    prepareRow: (row) => {
      row.name = String(row.name).trim();
    },
    plan: (rows, revision) => plan({ groups: rows as unknown as ImageGroup[] }, revision),
  };
  const references = options.references();
  const candidates = references.map(({ file }) => ({ value: file, label: file }));
  const candidateRevision = createHash('sha256').update(JSON.stringify(references)).digest('hex');
  return [
    groups,
    ...snapshot.groups.map((group) => {
      const field: SettingDefinition = {
        key: 'file',
        title: hostText('settings.imageLibrary.file'),
        type: 'select',
        options: [],
      };
      return {
        kind: 'list',
        targetId: `service.image-library.members.${Buffer.from(group.id).toString('base64url')}`,
        ownerId: 'appdock',
        category: 'image-library-members',
        title: group.name,
        available,
        fields: [field],
        definition: {
          key: 'images',
          title: group.name,
          type: 'object-list',
          fields: [field],
          list: { columns: ['file'], titleKey: 'file' },
        },
        operations: ['add', 'remove', 'reorder'],
        rows: () =>
          (library().groups.find((current) => current.id === group.id)?.images ?? []).map(
            ({ file }) => ({ file }),
          ),
        overrides: guard,
        applies: () => 'imageLibraryChanged',
        schemaContext: () => candidateRevision,
        options: () => candidates,
        inputSchema: () => ({ type: 'string', minLength: 1, maxLength: 180 }),
        createRow: () => ({}),
        validateField: (_field: SettingDefinition, value: unknown) => {
          if (
            !imageFilename(value) ||
            !references.some((ref) => imageKey(ref) === value.toLowerCase())
          )
            throw Error('Unavailable registered image');
        },
        plan: (rows, revision) =>
          plan(
            {
              groups: snapshot.groups.map((current) =>
                current.id === group.id
                  ? { ...current, images: rows.map((row) => ({ file: row.file as string })) }
                  : current,
              ),
            },
            revision,
          ),
      } satisfies SettingsListTarget;
    }),
  ];
}
