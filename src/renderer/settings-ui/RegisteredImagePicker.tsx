import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  imageKey,
  imageReference,
  type ImageLibraryApi,
  type ImageLibrarySnapshot,
  type RegisteredImageRef,
  type RegisteredImageEntry,
} from '../../shared/registered-images';
import { SettingsDialog } from './SettingsModal';
import { SettingsInput } from './SettingsInput';
import { SettingsHint } from './SettingsHint';
import { Icon } from '../Icon';
import './registered-images.css';

const ImagesContext = createContext<ImageLibraryApi | undefined>(undefined);
export function RegisteredImagesProvider({
  api,
  children,
}: {
  api: ImageLibraryApi;
  children: ReactNode;
}) {
  return <ImagesContext.Provider value={api}>{children}</ImagesContext.Provider>;
}
export const useRegisteredImages = () => useContext(ImagesContext);
export function useImageLibrary() {
  const api = useRegisteredImages();
  const [snapshot, setSnapshot] = useState<ImageLibrarySnapshot>({
    images: [],
    groups: [],
    revision: 0,
  });
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const reload = async () => {
    const current = ++sequence.current;
    try {
      if (!api) throw Error('画像ライブラリーは利用できません。');
      const next = await api.snapshot();
      if (sequence.current === current) {
        setSnapshot(next);
        setError(next.error ?? '');
      }
    } catch (e) {
      if (sequence.current === current) setError(String(e instanceof Error ? e.message : e));
    }
  };
  useEffect(() => {
    void reload();
    const off = api?.onChanged(() => void reload());
    return () => {
      ++sequence.current;
      off?.();
    };
  }, [api]);
  return { api, snapshot, error, setError, reload };
}
export function RegisteredImagePreview({
  value,
  original = false,
  className = '',
  label = '',
  fallback,
}: {
  value: unknown;
  original?: boolean;
  className?: string;
  label?: string;
  fallback?: string;
}) {
  const api = useRegisteredImages();
  const [url, setUrl] = useState<string | null>(null);
  const file = imageReference(value) ? value.file : '';
  useEffect(() => {
    let live = true,
      generation = 0;
    const update = async () => {
      const current = ++generation;
      try {
        const next = file ? await api?.preview({ file }, original) : null;
        if (live && current === generation) setUrl(next ?? null);
      } catch {
        if (live && current === generation) setUrl(null);
      }
    };
    void update();
    const off = api?.onChanged(() => void update());
    return () => {
      live = false;
      off?.();
    };
  }, [api, file, original]);
  return url || fallback ? (
    <img className={`registered-image-preview ${className}`} src={url || fallback} alt={label} />
  ) : file ? (
    <span className="registered-image-missing" aria-label="画像がありません">
      画像がありません
    </span>
  ) : null;
}
export function ImageLibraryBrowser({
  snapshot,
  selected,
  onSelect,
  group,
  onGroup,
  query,
  onQuery,
}: {
  snapshot: ImageLibrarySnapshot;
  selected: RegisteredImageRef | null;
  onSelect(image: RegisteredImageRef): void;
  group: string;
  onGroup(value: string): void;
  query: string;
  onQuery(value: string): void;
}) {
  const [limit, setLimit] = useState(64);
  useEffect(() => setLimit(64), [group, query]);
  const images = new Map(snapshot.images.map((image) => [imageKey(image.ref), image]));
  for (const g of snapshot.groups)
    for (const ref of g.images)
      if (!images.has(imageKey(ref)))
        images.set(imageKey(ref), {
          ref,
          width: 0,
          height: 0,
          bytes: 0,
          thumbnail: '',
          available: false,
        });
  if (selected && !images.has(imageKey(selected)))
    images.set(imageKey(selected), {
      ref: selected,
      width: 0,
      height: 0,
      bytes: 0,
      thumbnail: '',
      available: false,
    });
  const memberships = new Set(snapshot.groups.flatMap((g) => g.images.map(imageKey)));
  const filtered = [...images.values()].filter(
    (image) =>
      image.ref.file.toLowerCase().includes(query.toLowerCase()) &&
      (group === 'all' ||
        (group === 'unfiled'
          ? !memberships.has(imageKey(image.ref))
          : snapshot.groups
              .find((g) => `group:${g.id}` === group)
              ?.images.some((ref) => imageKey(ref) === imageKey(image.ref)))),
  );
  return (
    <>
      <div className="image-library-toolbar">
        <label>
          グループ
          <select
            aria-label="画像のグループ"
            value={group}
            onChange={(e) => onGroup(e.target.value)}
          >
            <option value="all">すべて</option>
            <option value="unfiled">未分類</option>
            {snapshot.groups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          検索
          <SettingsInput
            type="search"
            aria-label="画像のファイル名を検索"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="image-library-grid" role="group" aria-label="登録画像">
        {filtered.slice(0, limit).map((image) => (
          <button
            type="button"
            className={`image-library-card${selected && imageKey(selected) === imageKey(image.ref) ? ' selected' : ''}`}
            key={imageKey(image.ref)}
            aria-pressed={!!selected && imageKey(selected) === imageKey(image.ref)}
            onClick={() => onSelect(image.ref)}
            title={image.ref.file}
          >
            {image.thumbnail ? (
              <img src={image.thumbnail} alt="" />
            ) : (
              <span className="registered-image-missing">画像がありません</span>
            )}
            <span>{image.ref.file}</span>
            <small>
              {image.available ? `${image.width} × ${image.height}` : '未到着・読取待ち'}
            </small>
          </button>
        ))}
      </div>
      {!filtered.length && <p>該当する画像はありません。</p>}
      {filtered.length > limit && (
        <button type="button" className="secondary" onClick={() => setLimit(limit + 64)}>
          さらに表示（残り{filtered.length - limit}件）
        </button>
      )}
    </>
  );
}
export function RegisteredImagePicker({
  current,
  onSelect,
  onClose,
}: {
  current: RegisteredImageRef | null;
  onSelect(image: RegisteredImageRef | null): Promise<unknown> | void;
  onClose(): void;
}) {
  const library = useImageLibrary();
  const [selected, setSelected] = useState(current),
    [group, setGroup] = useState('all'),
    [query, setQuery] = useState(''),
    [registering, setRegistering] = useState(false);
  const applied = useRef(false);
  return (
    <SettingsDialog
      title="画像を選択"
      className="image-library-dialog"
      applyLabel="画像を使う"
      valid={!!library.api && !!selected && !registering}
      onClose={() => {
        if (!applied.current) onClose();
      }}
      onApply={async () => {
        if (!selected) return;
        await onSelect(selected);
        applied.current = true;
      }}
    >
      <div className="image-library-actions">
        <button
          type="button"
          className="secondary"
          disabled={!library.api || registering}
          onClick={async () => {
            setRegistering(true);
            library.setError('');
            try {
              const ref = await library.api!.register();
              if (ref) {
                setSelected(ref);
                setGroup('all');
                setQuery('');
                await library.reload();
              }
            } catch (e) {
              library.setError(String(e instanceof Error ? e.message : e));
            } finally {
              setRegistering(false);
            }
          }}
        >
          ライブラリーに登録
        </button>
        <span>{selected?.file ?? '画像なし'}</span>
      </div>
      <SettingsHint>
        登録した原画像は、この編集をキャンセルしてもライブラリーに残ります。
      </SettingsHint>
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
    </SettingsDialog>
  );
}
export function RegisteredImageInput({
  value,
  onChange,
  label = '画像',
  disabled = false,
}: {
  value: unknown;
  onChange(image: RegisteredImageRef | null): void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = imageReference(value) ? value : null;
  const api = useRegisteredImages();
  const action = ref ? '変更' : '選択';
  return (
    <div className="registered-image-input" role="group" aria-label={label}>
      <button
        type="button"
        className="registered-image-input-preview"
        aria-label={`${label}を${action}`}
        title={`画像を${action}`}
        disabled={disabled || !api}
        onClick={() => setOpen(true)}
      >
        {ref ? (
          <RegisteredImagePreview value={ref} label={`${label}のプレビュー`} />
        ) : (
          <span className="registered-image-empty" role="img" aria-label="画像なし">
            <Icon name="image" size={28} />
          </span>
        )}
      </button>
      <button
        type="button"
        className="registered-image-action"
        aria-label={`${label}を外す`}
        title="画像を外す"
        disabled={disabled || !ref}
        onClick={() => onChange(null)}
      >
        <Icon name="close" size={20} />
      </button>
      {open && (
        <RegisteredImagePicker
          current={ref}
          onClose={() => setOpen(false)}
          onSelect={(image) => {
            onChange(image);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
export function ImagePickerHost() {
  const api = useRegisteredImages();
  const [request, setRequest] = useState<{ id: string; current: RegisteredImageRef | null } | null>(
    null,
  );
  const [surfaces, setSurfaces] = useState<
    Parameters<NonNullable<ImageLibraryApi['onPickBackdrop']>>[0] extends (value: infer T) => void
      ? T
      : never
  >([]);
  useEffect(
    () => api?.onPickRequest?.((next) => setRequest((old) => (old?.id === next?.id ? old : next))),
    [api],
  );
  useEffect(() => api?.onPickBackdrop?.(setSurfaces), [api]);
  return (
    <>
      {surfaces.map((surface, index) => (
        <img
          key={index}
          alt=""
          aria-hidden
          className="image-picker-backdrop"
          src={surface.image}
          style={{
            left: surface.bounds.x,
            top: surface.bounds.y,
            width: surface.bounds.width,
            height: surface.bounds.height,
          }}
        />
      ))}
      {request && (
        <RegisteredImagePicker
          key={request.id}
          current={request.current}
          onClose={() => {
            void api?.completePick?.(request.id, { cancelled: true }).catch(() => {});
            setRequest(null);
          }}
          onSelect={async (image) => {
            await api?.completePick?.(request.id, { cancelled: false, image });
            setRequest(null);
          }}
        />
      )}
    </>
  );
}
