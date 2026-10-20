import { useState } from 'react';
import type { ImageGroup, RegisteredImageRef } from '../../shared/registered-images';
import { imageKey } from '../../shared/registered-images';
import {
  ImageLibraryBrowser,
  RegisteredImagePreview,
  useImageLibrary,
} from '../settings-ui/RegisteredImagePicker';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsSection } from '../settings-ui/SettingsSections';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { settingAnchor } from '../settings-ui/setting-anchor';
export function ImageLibrarySettings() {
  const library = useImageLibrary();
  const [group, setGroup] = useState('all'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<RegisteredImageRef | null>(null);
  const [editing, setEditing] = useState<{ group: ImageGroup; before?: ImageGroup }>(),
    [deleting, setDeleting] = useState<ImageGroup>();
  const [membership, setMembership] = useState<{
      image: RegisteredImageRef;
      ids: string[];
      before: string[];
    }>(),
    [order, setOrder] = useState<ImageGroup[]>(),
    [preview, setPreview] = useState<RegisteredImageRef>();
  const [busy, setBusy] = useState(false);
  const currentGroup = library.snapshot.groups.find((g) => `group:${g.id}` === group);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    library.setError('');
    try {
      await work();
      await library.reload();
    } catch (e) {
      library.setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-sections">
      <SettingsSection title="登録画像" {...settingAnchor('image-library', 'images')}>
        <div className="image-library-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !library.api}
            onClick={() =>
              void run(async () => {
                const ref = await library.api!.register();
                if (ref) {
                  setSelected(ref);
                  setGroup('all');
                  setQuery('');
                }
              })
            }
          >
            ライブラリーに登録
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selected}
            onClick={() => setPreview(selected!)}
          >
            プレビュー
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selected || busy}
            onClick={() => {
              const ids = library.snapshot.groups
                .filter((g) => g.images.some((ref) => imageKey(ref) === imageKey(selected!)))
                .map((g) => g.id);
              setMembership({ image: selected!, ids, before: ids });
            }}
          >
            所属グループを編集
          </button>
        </div>
        {library.error && <p role="alert">{library.error}</p>}
        <ImageLibraryBrowser
          snapshot={library.snapshot}
          selected={selected}
          onSelect={setSelected}
          group={group}
          onGroup={setGroup}
          query={query}
          onQuery={setQuery}
        />
      </SettingsSection>
      <SettingsSection title="グループ" {...settingAnchor('image-library', 'groups')}>
        <div className="image-library-actions">
          <button
            type="button"
            className="secondary"
            disabled={library.snapshot.groups.length >= 64}
            onClick={() => setEditing({ group: { id: crypto.randomUUID(), name: '', images: [] } })}
          >
            グループを追加
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!currentGroup}
            onClick={() =>
              setEditing({
                group: structuredClone(currentGroup!),
                before: structuredClone(currentGroup!),
              })
            }
          >
            選択中のグループを編集
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!currentGroup}
            onClick={() => setDeleting(structuredClone(currentGroup!))}
          >
            グループを削除
          </button>
          <button
            type="button"
            className="secondary"
            disabled={library.snapshot.groups.length < 2}
            onClick={() => setOrder(structuredClone(library.snapshot.groups))}
          >
            グループを並べ替え
          </button>
        </div>
        <p>同じ画像を複数のグループで整理できます。グループを削除しても画像と使用先は残ります。</p>
      </SettingsSection>
      {editing && (
        <SettingsDialog
          title={editing.before ? '画像グループを編集' : '画像グループを追加'}
          valid={!!editing.group.name.trim() && editing.group.name.trim().length <= 80}
          onClose={() => setEditing(undefined)}
          onApply={async () => {
            await library.api!.edit(
              editing.before
                ? { kind: 'update', group: editing.group, before: editing.before }
                : { kind: 'add', group: editing.group },
            );
            await library.reload();
          }}
        >
          <label>
            グループ名
            <SettingsInput
              data-initial-focus
              aria-label="画像グループ名"
              maxLength={80}
              value={editing.group.name}
              onChange={(e) =>
                setEditing({ ...editing, group: { ...editing.group, name: e.target.value } })
              }
            />
          </label>
        </SettingsDialog>
      )}
      {deleting && (
        <SettingsDialog
          title="画像グループを削除"
          applyLabel="削除"
          onClose={() => setDeleting(undefined)}
          onApply={async () => {
            await library.api!.edit({ kind: 'delete', id: deleting.id, before: deleting });
            setGroup('all');
            await library.reload();
          }}
        >
          <p>
            「{deleting.name}
            」とその所属を削除します。原画像と、Appletやリボンで使用中の画像は残ります。
          </p>
        </SettingsDialog>
      )}
      {membership && (
        <SettingsDialog
          title="所属グループを編集"
          onClose={() => setMembership(undefined)}
          onApply={async () => {
            await library.api!.edit({ kind: 'membership', ...membership });
            await library.reload();
          }}
        >
          <p>{membership.image.file}</p>
          {library.snapshot.groups.map((g) => (
            <label className="image-group-choice" key={g.id}>
              <input
                type="checkbox"
                checked={membership.ids.includes(g.id)}
                onChange={(e) =>
                  setMembership({
                    ...membership,
                    ids: e.target.checked
                      ? [...membership.ids, g.id]
                      : membership.ids.filter((id) => id !== g.id),
                  })
                }
              />
              {g.name}
            </label>
          ))}
          {!library.snapshot.groups.length && <p>先にグループを追加してください。</p>}
        </SettingsDialog>
      )}
      {order && (
        <SettingsOrderDialog
          title="画像グループを並べ替え"
          listLabel="画像グループの表示順"
          items={order.map((g) => ({ id: g.id, title: g.name }))}
          onClose={() => setOrder(undefined)}
          onApply={async (ids) => {
            await library.api!.edit({ kind: 'order', ids, before: order.map((g) => g.id) });
            await library.reload();
          }}
        />
      )}
      {preview && (
        <SettingsDialog
          title={preview.file}
          applyLabel="閉じる"
          onClose={() => setPreview(undefined)}
          onApply={async () => {}}
        >
          <RegisteredImagePreview value={preview} original className="image-library-original" />
        </SettingsDialog>
      )}
    </div>
  );
}
