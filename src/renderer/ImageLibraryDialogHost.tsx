import { useEffect, useState } from 'react';
import type { ImageLibraryDialogRequest } from '../shared/image-library-page';
import { imageKey, type ImageLibraryEdit } from '../shared/registered-images';
import { SettingsDialog, SettingsModal } from './settings-ui/SettingsModal';
import { SettingsInput } from './settings-ui/SettingsInput';
import { SettingsOrderDialog } from './settings-ui/SettingsOrderDialog';
import { RegisteredGalleryPreview } from './settings-ui/RegisteredImagePicker';

export function ImageLibraryDialogHost() {
  const [request, setRequest] = useState<ImageLibraryDialogRequest | null>(null);
  useEffect(
    () =>
      window.dock.imageLibraryDialog.onRequest((next) =>
        setRequest((old) => (old?.id === next?.id ? old : next)),
      ),
    [],
  );
  return request ? <Editor key={request.id} request={request} /> : null;
}
function Editor({ request: r }: { request: ImageLibraryDialogRequest }) {
  const current = r.groups.find((g) => g.id === r.groupId);
  const before = (image: { file: string }) =>
    r.groups.filter((g) => g.images.some((i) => imageKey(i) === imageKey(image))).map((g) => g.id);
  const [name, setName] = useState(current?.name ?? '');
  const [ids, setIds] = useState(r.images[0] ? before(r.images[0]) : []);
  const [target, setTarget] = useState(r.groups[0]?.id ?? '');
  const [error, setError] = useState('');
  const close = () => {
    void window.dock.imageLibraryDialog.complete(r.id).catch((e) => setError(String(e)));
  };
  const save = (operation: ImageLibraryEdit) =>
    window.dock.imageLibraryDialog.complete(r.id, operation);
  if (r.kind === 'order')
    return (
      <SettingsOrderDialog
        title="画像グループを並べ替え"
        listLabel="画像グループの表示順"
        items={r.groups.map((g) => ({ id: g.id, title: g.name }))}
        onClose={close}
        onApply={(ids) => save({ kind: 'order', ids, before: r.groups.map((g) => g.id) })}
      />
    );
  if (r.kind === 'preview')
    return (
      <SettingsModal
        labelledBy="image-library-preview-title"
        className="image-library-preview-modal"
        onClose={close}
      >
        <header className="image-library-preview-heading">
          <h2 id="image-library-preview-title">{r.images[0]?.file}</h2>
          <button type="button" data-initial-focus onClick={close}>
            閉じる
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        {r.entry && <RegisteredGalleryPreview entry={r.entry} groups={r.groups} />}
      </SettingsModal>
    );
  const titles = {
    add: '画像グループを追加',
    rename: '画像グループの名前を変更',
    delete: '画像グループを削除',
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
        groupId: r.kind === 'batch-add' ? target : r.groupId!,
        images: r.images.map((image) => ({ image, before: before(image) })),
      });
  };
  return (
    <SettingsDialog
      title={titles[r.kind]}
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
          : r.kind === 'batch-add'
            ? !!target
            : true
      }
    >
      {error && <p role="alert">{error}</p>}
      {['add', 'rename'].includes(r.kind) && (
        <label>
          グループ名
          <SettingsInput
            data-initial-focus
            aria-label="画像グループ名"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      {r.kind === 'delete' && <p>「{current?.name}」を削除します。画像と使用先は残ります。</p>}
      {r.kind === 'membership' && (
        <>
          <p>{r.images[0].file}</p>
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
          {!r.groups.length && (
            <p>ページの「グループを追加」から、先にグループを作成してください。</p>
          )}
        </>
      )}
      {r.kind === 'batch-add' && (
        <>
          <p>{r.images.length}枚の画像を追加します。ほかのグループへの所属は残ります。</p>
          <label>
            追加先
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
          </label>
          {!r.groups.length && <p>先にグループを追加してください。</p>}
        </>
      )}
      {r.kind === 'batch-remove' && (
        <p>
          「{current?.name}」から{r.images.length}枚を外します。画像とほかの所属は残ります。
        </p>
      )}
    </SettingsDialog>
  );
}
