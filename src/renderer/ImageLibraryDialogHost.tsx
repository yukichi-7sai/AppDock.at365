import { SettingsField } from './settings-ui/SettingsSections';
import { LibraryMediaProvider, useLibraryTranslation } from './image-browser/LibraryMedia';
import { libraryPath } from '../shared/library-assets';
import { snippetGroupId } from '../shared/text-library';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  ImageLibraryDialogRequest,
  ImageLibraryDialogOperation,
} from '../shared/image-library-page';
import { imageKey } from '../shared/registered-images';
import { imageBasename, imageParent } from '../shared/image-paths';
import { SettingsButton } from './settings-ui/SettingsButton';
import { LibraryPreviewDialog } from './settings-ui/LibraryPreviewDialog';
import { SettingsDialog, SettingsModal } from './settings-ui/SettingsModal';
import { SettingsInput } from './settings-ui/SettingsInput';
import { TextLibraryEditor } from './TextLibraryEditor';
import { SettingsOrderDialog } from './settings-ui/SettingsOrderDialog';
import { RegisteredGalleryPreview } from './settings-ui/RegisteredImagePicker';

const DialogFocus = createContext<{ current: { target: HTMLElement | null } | null } | null>(null);

export function ImageLibraryDialogProvider({ children }: { children: ReactNode }) {
  const opening = useRef<{ target: HTMLElement | null } | null>(null);
  return (
    <DialogFocus.Provider value={opening}>
      {children}
      <ImageLibraryDialogHost />
    </DialogFocus.Provider>
  );
}

/** Capture before the page becomes inert; the target never crosses the host IPC boundary. */
export function useImageLibraryDialogFocus() {
  const opening = useContext(DialogFocus);
  if (!opening) throw Error('Image library dialogs are not connected');
  return (target = document.activeElement) => {
    const request = { target: target instanceof HTMLElement ? target : null };
    opening.current = request;
    return () => {
      if (opening.current === request) opening.current = null;
    };
  };
}

export function ImageLibraryDialogHost() {
  const opening = useContext(DialogFocus);
  const [request, setRequest] = useState<ImageLibraryDialogRequest | null>(null);
  useEffect(
    () =>
      window.dock.imageLibraryDialog.onRequest((next) =>
        setRequest((old) =>
          old?.id === next?.id && next?.kind !== 'import-progress' ? old : next,
        ),
      ),
    [],
  );
  return request ? (
    <LibraryMediaProvider media={request.media ?? 'image'}>
      <Editor key={request.id} request={request} returnFocus={opening?.current?.target ?? null} />
    </LibraryMediaProvider>
  ) : null;
}
function Editor({
  request: r,
  returnFocus,
}: {
  request: ImageLibraryDialogRequest;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useLibraryTranslation();
  const current = r.groups.find((g) => g.id === r.groupId);
  const before = (image: { file: string }) =>
    r.groups.filter((g) => g.images.some((i) => imageKey(i) === imageKey(image))).map((g) => g.id);
  const [name, setName] = useState(current?.name ?? '');
  const [ids, setIds] = useState(r.images[0] ? before(r.images[0]) : []);
  const [target, setTarget] = useState(current?.id ?? r.groups[0]?.id ?? '');
  const entries = r.entries ?? (r.entry ? [r.entry] : []);
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(
      0,
      entries.findIndex((entry) => entry.ref.file === r.entry?.ref.file),
    ),
  );
  const extensions = r.images.map((image) => image.file.slice(image.file.lastIndexOf('.')));
  const [names, setNames] = useState(
    r.images.map((image, i) => imageBasename(image.file).slice(0, -extensions[i].length)),
  );
  const [error, setError] = useState('');
  const [folderPath, setFolderPath] = useState(
    r.kind === 'folder-create' && r.folder ? r.folder + '/' : (r.folder ?? ''),
  );
  const [setId, setSetId] = useState(r.iconSets?.[0]?.id ?? '');
  const completed = useRef(false);
  const close = () => {
    if (completed.current) return;
    void window.dock.imageLibraryDialog.complete(r.id).catch((e) => setError(String(e)));
  };
  const save = async (operation: ImageLibraryDialogOperation) => {
    await window.dock.imageLibraryDialog.complete(r.id, operation);
    completed.current = true;
  };
  if (r.kind === 'text-create' || r.kind === 'text-edit' || r.kind === 'text-preview')
    return (
      <TextLibraryEditor
        request={r}
        returnFocus={returnFocus}
        onClose={close}
        onSave={save}
        error={error}
      />
    );
  if (r.kind === 'import-progress') {
    const p = r.importing;
    const phase = p?.phase ?? 'download';
    const labels = {
      download: 'images.downloading',
      metadata: 'images.metadataDownloading',
      validate: 'images.validating',
      import: 'images.importProgress',
      groups: 'images.assigningGroups',
    } as const;
    const label = r.cancelling
      ? t('images.cancelling')
      : t(labels[phase], { completed: p?.completed ?? 0, total: p?.total ?? 0 });
    return (
      <SettingsModal
        labelledBy={`image-import-${r.id}`}
        returnFocus={returnFocus}
        onClose={close}
        closeDisabled={r.cancelling}
        error={error}
        header={
          <header>
            <h2 id={`image-import-${r.id}`}>{t('images.importSet')}</h2>
          </header>
        }
        footer={
          <footer>
            <button type="button" data-initial-focus disabled={r.cancelling} onClick={close}>
              {t('images.importCancel')}
            </button>
          </footer>
        }
      >
        <div className="image-library-import-progress">
          <p role="status">{label}</p>
          <progress
            aria-label={label}
            max={p?.total || 1}
            value={phase === 'import' ? p?.completed : undefined}
          />
          {p && p.completed > 0 && (
            <p>
              {t('images.importDone', {
                added: p.added,
                reused: p.reused,
                failed: p.failed,
              })}
            </p>
          )}
          <p>{t('images.importCancelHint')}</p>
        </div>
      </SettingsModal>
    );
  }
  if (r.kind === 'import-set')
    return (
      <SettingsDialog
        title={t('images.importSet')}
        applyLabel={t('images.importStart')}
        returnFocus={returnFocus}
        closeAfterApply={false}
        error={error}
        onClose={close}
        onApply={() => save({ kind: 'import-set', setId })}
      >
        <SettingsField title={t('images.set')}>
          <select
            aria-label={t('images.set')}
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
          >
            {r.iconSets?.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </SettingsField>
      </SettingsDialog>
    );
  if (
    r.kind === 'folder-create' ||
    r.kind === 'folder-rename' ||
    r.kind === 'folder-delete' ||
    r.kind === 'folder-move'
  ) {
    const titles = {
      'folder-create': 'images.createFolder',
      'folder-rename': 'images.renameFolder',
      'folder-delete': 'images.deleteFolder',
      'folder-move': 'images.moveImages',
    } as const;
    return (
      <SettingsDialog
        title={t(titles[r.kind as keyof typeof titles])}
        returnFocus={returnFocus}
        closeAfterApply={false}
        error={error}
        applyLabel={t('images.apply')}
        onClose={close}
        onApply={() => save({ kind: 'folder', destination: folderPath })}
      >
        {r.kind === 'folder-delete' ? (
          <p>{t('images.folderDeleteConfirm')}</p>
        ) : r.kind === 'folder-move' ? (
          <SettingsField title={t('images.destination')}>
            <select
              aria-label={t('images.destination')}
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            >
              {r.folders?.map((folder) => (
                <option key={folder} value={folder}>
                  {folder || t('images.rootFolder')}
                </option>
              ))}
            </select>
          </SettingsField>
        ) : (
          <SettingsField title={t('images.folderPath')}>
            <SettingsInput
              data-initial-focus
              aria-label={t('images.folderPath')}
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
          </SettingsField>
        )}
      </SettingsDialog>
    );
  }
  if (r.kind === 'order-images')
    return (
      <SettingsOrderDialog
        returnFocus={returnFocus}
        title={t('images.orderImages')}
        listLabel={t('images.groupItemsOrder', { name: current?.name ?? '' })}
        items={(current?.images ?? []).map((image) => ({ id: imageKey(image), title: image.file }))}
        onClose={close}
        onApply={(ids) => {
          if (!current) throw Error('グループが見つかりません。');
          const images = new Map(current.images.map((image) => [imageKey(image), image]));
          return save({
            kind: 'update',
            before: current,
            group: { ...current, images: ids.map((id) => images.get(id)!) },
          });
        }}
      />
    );
  if (r.kind === 'order')
    return (
      <SettingsOrderDialog
        returnFocus={returnFocus}
        title={t('images.groupOrderTitle')}
        listLabel={t('images.groupOrderLabel')}
        items={r.groups
          .filter((g) => r.media !== 'text' || g.id !== snippetGroupId)
          .map((g) => ({ id: g.id, title: g.name }))}
        onClose={close}
        onApply={(ids) =>
          save({
            kind: 'order',
            ids: r.media === 'text' ? [snippetGroupId, ...ids] : ids,
            before: r.groups.map((g) => g.id),
          })
        }
      />
    );
  if (r.kind === 'rename-images') {
    const filenames = names.map((name, i) => name + extensions[i]);
    const destinations = filenames.map((name, i) =>
      (imageParent(r.images[i].file) + '/' + name).toLowerCase(),
    );
    const valid =
      !r.deleteBlocked &&
      filenames.every(
        (name) =>
          name === imageBasename(name) &&
          ((value: unknown) => libraryPath(value, r.media ?? 'image'))(name),
      ) &&
      new Set(destinations).size === destinations.length;
    return (
      <SettingsDialog
        returnFocus={returnFocus}
        title={t('images.renameImages')}
        onClose={close}
        onApply={() => save({ kind: 'rename-images', names: filenames })}
        applyLabel={t('images.apply')}
        valid={valid}
        description={t('images.renameDescription', { count: r.images.length })}
        error={r.deleteBlocked ? t('images.inUseRename') : error}
      >
        <div className="library-rename-list">
          {r.images.map((image, i) => (
            <div className="library-rename-row" key={image.file}>
              <span>{image.file}</span>
              <span aria-hidden="true">→</span>
              <label>
                <SettingsInput
                  data-initial-focus={i === 0 || undefined}
                  aria-label={t('images.newName', { name: image.file })}
                  value={names[i]}
                  onChange={(e) =>
                    setNames((old) => old.map((name, n) => (n === i ? e.target.value : name)))
                  }
                />
                <small>{extensions[i]}</small>
              </label>
            </div>
          ))}
        </div>
      </SettingsDialog>
    );
  }
  if (r.kind === 'delete-image')
    return (
      <SettingsDialog
        returnFocus={returnFocus}
        title={t('images.deleteImages')}
        onClose={close}
        onApply={() => save({ kind: 'delete-image' })}
        applyLabel="削除"
        valid={!r.deleteBlocked}
        description={t('images.deleteDescription', { count: r.images.length })}
        error={r.deleteBlocked ? t('services.imageLibraryHost.inUse') : error}
        errorTarget={r.images[0]?.file}
      >
        <ul className="library-confirm-files">
          {r.images.map((image) => (
            <li key={image.file}>{image.file}</li>
          ))}
        </ul>
      </SettingsDialog>
    );
  if (r.kind === 'preview')
    return (
      <LibraryPreviewDialog
        returnFocus={returnFocus}
        title={entries[previewIndex]?.ref.file ?? ''}
        className="image-library-preview-modal"
        onClose={close}
        error={error}
      >
        {entries.length > 1 && (
          <div className="library-preview-navigation">
            <SettingsButton
              disabled={previewIndex === 0}
              onClick={() => setPreviewIndex((i) => i - 1)}
            >
              {t('images.previous')}
            </SettingsButton>
            <span aria-live="polite">
              {previewIndex + 1} / {entries.length}
            </span>
            <SettingsButton
              disabled={previewIndex === entries.length - 1}
              onClick={() => setPreviewIndex((i) => i + 1)}
            >
              {t('images.next')}
            </SettingsButton>
          </div>
        )}
        {entries[previewIndex] && (
          <RegisteredGalleryPreview
            key={entries[previewIndex].ref.file}
            entry={entries[previewIndex]}
            groups={r.groups}
          />
        )}
      </LibraryPreviewDialog>
    );
  const titles = {
    add: t('images.groupAddTitle'),
    rename: t('images.groupRenameTitle'),
    delete: t('images.groupDeleteTitle'),
    membership: '所属グループを編集',
    'batch-add': 'グループに追加',
    'batch-remove': 'グループから外す',
  };
  const apply = async () => {
    if (r.kind === 'add')
      await save({ kind: 'add', group: { id: crypto.randomUUID(), name, images: [] } });
    else if (r.kind === 'rename' && current)
      await save({ kind: 'update', group: { ...current, name }, before: current });
    else if (r.kind === 'delete' && current)
      await save({ kind: 'delete', id: current.id, before: current });
    else if (r.kind === 'membership')
      await save({ kind: 'membership', image: r.images[0], ids, before: before(r.images[0]) });
    else if (r.kind === 'batch-add' || r.kind === 'batch-remove')
      await save({
        kind: 'membership-batch',
        mode: r.kind === 'batch-add' ? 'add' : 'remove',
        groupId: target,
        images: r.images.map((image) => ({ image, before: before(image) })),
      });
  };
  return (
    <SettingsDialog
      returnFocus={returnFocus}
      title={titles[r.kind]}
      error={error}
      onClose={close}
      onApply={apply}
      applyLabel={
        r.kind === 'add'
          ? '追加'
          : r.kind === 'delete'
            ? '削除'
            : r.kind === 'batch-remove'
              ? '外す'
              : '適用'
      }
      valid={
        ['add', 'rename'].includes(r.kind)
          ? !!name.trim() && name.trim().length <= 80
          : r.kind === 'batch-add' || r.kind === 'batch-remove'
            ? !!target
            : true
      }
    >
      {['add', 'rename'].includes(r.kind) && (
        <SettingsField title="グループ名">
          <SettingsInput
            data-initial-focus
            aria-label={t('images.groupName')}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </SettingsField>
      )}
      {r.kind === 'delete' && (
        <p>{t('images.groupDeleteDescription', { name: current?.name ?? '' })}</p>
      )}
      {r.kind === 'membership' && (
        <SettingsField
          title="所属グループ"
          description={
            r.groups.length
              ? r.images[0].file
              : 'ページの「グループを追加」から、先にグループを作成してください。'
          }
        >
          {r.groups.map((g) => (
            <label className="image-group-choice" key={g.id}>
              <input
                type="checkbox"
                checked={ids.includes(g.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, g.id] : ids.filter((id) => id !== g.id))
                }
              />
              {g.name}
            </label>
          ))}
        </SettingsField>
      )}
      {r.kind === 'batch-add' && (
        <>
          <p>{t('images.groupAddDescription', { count: r.images.length })}</p>
          <SettingsField title="追加先">
            <select
              aria-label="追加先グループ"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {r.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </SettingsField>
          {!r.groups.length && <p>先にグループを追加してください。</p>}
        </>
      )}
      {r.kind === 'batch-remove' && (
        <>
          <p>{t('images.removeDescription', { count: r.images.length })}</p>
          <SettingsField title={t('images.removeGroupTarget')}>
            <select
              aria-label={t('images.removeGroupTarget')}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {r.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </SettingsField>
        </>
      )}
    </SettingsDialog>
  );
}
