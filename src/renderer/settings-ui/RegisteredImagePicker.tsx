import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from './SettingsSections';
import { SettingsMcpAccessProvider } from './SettingsMcpAccess';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  imageKey,
  imageReference,
  type ImageLibraryApi,
  type ImageLibrarySnapshot,
  type RegisteredImageRef,
  type RegisteredImageEntry,
} from '../../shared/registered-images';
import { SettingsDialog, SettingsModal } from './SettingsModal';
import { ImageGallery, GallerySizeControl, ImageGalleryPreview } from './ImageGallery';
import { gallerySize } from '../../shared/image-gallery';
import { SettingsInput } from './SettingsInput';
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
/** Each mounted image surface releases only its own host cache ownership. */
function useImageSession(api: ImageLibraryApi | undefined) {
  const owner = useRef<{ live: boolean; pending?: Promise<string> }>({ live: true });
  useEffect(() => {
    if (!owner.current.live) owner.current = { live: true };
    return () => {
      const closed = owner.current;
      closed.live = false;
      void closed.pending?.then((id) => api?.releaseImageSession(id)).catch(() => {});
    };
  }, [api]);
  const session = async () => {
    const current = owner.current;
    if (!api || !current.live) throw Error(hostText('settings.registeredImagePicker.updated'));
    current.pending ??= api.createImageSession();
    const id = await current.pending;
    if (!current.live) throw Error(hostText('settings.registeredImagePicker.updated'));
    return id;
  };
  return {
    preview: async (ref: RegisteredImageRef, original = false) =>
      api!.preview(ref, original, await session()),
    image: async (ref: RegisteredImageRef, generation: string, edge: number) =>
      api!.galleryImage(ref, generation, edge, await session()),
  };
}
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
      if (!api) throw Error(hostText('settings.registeredImagePicker.unavailable'));
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
  const { t: translate } = useHostTranslation();
  const api = useRegisteredImages();
  const images = useImageSession(api);
  const [url, setUrl] = useState<string | null>(null);
  const file = imageReference(value) ? value.file : '';
  useEffect(() => {
    let live = true,
      generation = 0;
    const update = async () => {
      const current = ++generation;
      try {
        const next = file && api ? await images.preview({ file }, original) : null;
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
    <span
      className="registered-image-missing"
      aria-label={translate('settings.registeredImagePicker.empty')}
    >
      {translate('settings.registeredImagePicker.empty')}
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
  cardWidth,
  disabled = false,
  onPreview,
}: {
  snapshot: ImageLibrarySnapshot;
  selected: RegisteredImageRef | null;
  onSelect(image: RegisteredImageRef): void;
  group: string;
  onGroup(value: string): void;
  query: string;
  onQuery(value: string): void;
  cardWidth: number;
  disabled?: boolean;
  onPreview(entry: RegisteredImageEntry): void;
}) {
  const { t: translate } = useHostTranslation();
  const api = useRegisteredImages();
  const imageSession = useImageSession(api);
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
        <SettingsField title={translate('settings.registeredImagePicker.group')}>
          <select
            aria-label={translate('settings.registeredImagePicker.groupLabel')}
            value={group}
            onChange={(e) => onGroup(e.target.value)}
          >
            <option value="all">{translate('settings.registeredImagePicker.all')}</option>
            <option value="unfiled">{translate('settings.registeredImagePicker.ungrouped')}</option>
            {snapshot.groups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                {g.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField title={translate('settings.registeredImagePicker.search')}>
          <SettingsInput
            type="search"
            aria-label={translate('settings.registeredImagePicker.searchPlaceholder')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </SettingsField>
      </div>
      <ImageGallery
        resetKey={`${group}:${query}`}
        model={{
          cardWidth,
          fit: 'contain',
          selection: 'single',
          empty: translate('settings.registeredImagePicker.noMatches'),
          items: filtered.slice(0, limit).map((image) => ({
            id: imageKey(image.ref),
            assetId: `${imageKey(image.ref)}:${image.generation ?? ''}`,
            title: image.ref.file,
            detail:
              image.width > 0
                ? `${image.width} × ${image.height}`
                : translate('services.imageLibraryPage.dimensionsUnavailable'),
            labels: snapshot.groups
              .filter((g) => g.images.some((ref) => imageKey(ref) === imageKey(image.ref)))
              .map((g) => g.name),
            state: image.available ? 'ready' : (image.state ?? 'missing'),
            selected: !!selected && imageKey(selected) === imageKey(image.ref),
            selectable: !disabled,
            actions: [
              {
                id: 'preview',
                title: translate('settings.registeredImagePicker.enlarge'),
                disabled: disabled || !image.available,
              },
            ],
          })),
        }}
        options={{
          image: async (assetId, edge) => {
            const item = [...images.values()].find(
              (image) => `${imageKey(image.ref)}:${image.generation ?? ''}` === assetId,
            );
            if (!item || !api) throw Error(translate('settings.registeredImagePicker.updated'));
            return imageSession.image(item.ref, item.generation ?? '', edge);
          },
          select: (id) => {
            if (!disabled && images.has(id)) onSelect(images.get(id)!.ref);
          },
          activate: () => {},
          action: (id) => {
            if (!disabled && images.has(id)) onPreview(images.get(id)!);
          },
        }}
      />
      {filtered.length > limit && (
        <button type="button" className="secondary" onClick={() => setLimit(limit + 64)}>
          {translate('settings.registeredImagePicker.more', { count: filtered.length - limit })}
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
  const { t: translate } = useHostTranslation();
  const library = useImageLibrary();
  const [selected, setSelected] = useState(current),
    [group, setGroup] = useState('all'),
    [query, setQuery] = useState(''),
    [registering, setRegistering] = useState(false);
  const applied = useRef(false);
  const [cardWidth, setCardWidth] = useState<number>(gallerySize.initial);
  const [sizeError, setSizeError] = useState('');
  const [preview, setPreview] = useState<RegisteredImageEntry | null>(null);
  const sizeTouched = useRef(false);
  const widthSave = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    void library.api
      ?.galleryView()
      .then((view) => {
        if (!live) return;
        if (!sizeTouched.current) setCardWidth(view.cardWidth);
        setSizeError(view.error);
      })
      .catch(() => {
        if (live) setSizeError(translate('settings.registeredImagePicker.sizeUnreadable'));
      });
    return () => {
      live = false;
    };
  }, [library.api]);
  const saveWidth = (value: number) => {
    sizeTouched.current = true;
    widthSave.current = widthSave.current
      .catch(() => {})
      .then(async () => {
        try {
          await library.api?.saveGalleryWidth(value);
          setSizeError('');
        } catch (error) {
          setSizeError(error instanceof Error ? error.message : String(error));
        }
      });
  };
  return (
    <SettingsMcpAccessProvider value={undefined}>
      <SettingsDialog
        title={translate('settings.registeredImagePicker.select')}
        description={translate('settings.registeredImagePicker.keepOriginal')}
        error={[library.error, sizeError].filter(Boolean).join('\n')}
        errorTarget={translate('settings.registeredImagePicker.selection')}
        errorAction={
          sizeError ? (
            <button type="button" onClick={() => saveWidth(cardWidth)}>
              {translate('settings.registeredImagePicker.retry')}
            </button>
          ) : undefined
        }
        className="image-library-dialog"
        applyLabel={translate('settings.registeredImagePicker.use')}
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
            {translate('settings.registeredImagePicker.register')}
          </button>
          <span>{selected?.file ?? translate('settings.registeredImagePicker.none')}</span>
        </div>
        <GallerySizeControl
          value={cardWidth}
          onChange={(value) => {
            sizeTouched.current = true;
            setCardWidth(value);
          }}
          onCommit={saveWidth}
        />
        <ImageLibraryBrowser
          snapshot={library.snapshot}
          selected={selected}
          onSelect={setSelected}
          group={group}
          onGroup={setGroup}
          query={query}
          onQuery={setQuery}
          cardWidth={cardWidth}
          disabled={registering}
          onPreview={setPreview}
        />
        {preview && (
          <SettingsModal
            labelledBy="picker-preview-title"
            className="image-library-preview-modal"
            closeOnBackdrop
            onClose={() => setPreview(null)}
            header={
              <header className="image-library-preview-heading">
                <h2 id="picker-preview-title">{preview.ref.file}</h2>
                <button type="button" data-initial-focus onClick={() => setPreview(null)}>
                  {translate('settings.registeredImagePicker.close')}
                </button>
              </header>
            }
          >
            <RegisteredGalleryPreview entry={preview} groups={library.snapshot.groups} />
          </SettingsModal>
        )}
      </SettingsDialog>
    </SettingsMcpAccessProvider>
  );
}
export function RegisteredGalleryPreview({
  entry: initialEntry,
  groups,
}: {
  entry: RegisteredImageEntry;
  groups: ImageLibrarySnapshot['groups'];
}) {
  const { t: translate } = useHostTranslation();
  const library = useImageLibrary();
  const api = library.api;
  const imageSession = useImageSession(api);
  const entry =
    library.snapshot.images.find(
      (image) =>
        imageKey(image.ref) === imageKey(initialEntry.ref) &&
        image.generation === initialEntry.generation,
    ) ?? initialEntry;
  const labels = groups
    .filter((g) => g.images.some((ref) => imageKey(ref) === imageKey(entry.ref)))
    .map((g) => g.name);
  return (
    <ImageGalleryPreview
      model={{
        assetId: `${imageKey(entry.ref)}:${entry.generation ?? ''}`,
        title: entry.ref.file,
        state: entry.available ? 'ready' : (entry.state ?? 'missing'),
        detail: `${entry.width > 0 ? `${entry.width} × ${entry.height}` : translate('services.imageLibraryPage.dimensionsUnavailable')} · ${entry.ref.file.split('.').at(-1)?.toUpperCase()} · ${(entry.bytes / 1024).toFixed(1)} KiB`,
        labels: labels.length ? labels : [translate('settings.registeredImagePicker.ungrouped')],
      }}
      image={async () => {
        const source = api ? await imageSession.preview(entry.ref, true) : null;
        if (!source) throw Error(translate('settings.registeredImagePicker.unreadable'));
        return source;
      }}
    />
  );
}
export function RegisteredImageInput({
  testId,
  value,
  preview,
  onChange,
  label = hostText('settings.registeredImagePicker.image'),
  disabled = false,
}: {
  testId?: string;
  value: unknown;
  preview?: string;
  onChange(image: RegisteredImageRef | null): void;
  label?: string;
  disabled?: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const [open, setOpen] = useState(false);
  const ref = imageReference(value) ? value : null;
  const api = useRegisteredImages();

  return (
    <div className="registered-image-input" role="group" aria-label={label}>
      <button
        type="button"
        className="registered-image-input-preview"
        data-testid={testId ? `${testId}:choose` : undefined}
        aria-label={translate(
          ref
            ? 'settings.registeredImagePicker.changeLabel'
            : 'settings.registeredImagePicker.chooseLabel',
          { label },
        )}
        title={translate(
          ref
            ? 'settings.registeredImagePicker.changeImage'
            : 'settings.registeredImagePicker.chooseImage',
        )}
        disabled={disabled || !api}
        onClick={() => setOpen(true)}
      >
        {ref ? (
          <RegisteredImagePreview
            value={ref}
            label={translate('settings.registeredImagePicker.preview', { label: label })}
          />
        ) : preview ? (
          <img
            data-testid={testId ? `${testId}:preview` : undefined}
            className="registered-image-preview"
            src={preview}
            alt={label}
          />
        ) : (
          <span
            className="registered-image-empty"
            role="img"
            aria-label={translate('settings.registeredImagePicker.none')}
          >
            <Icon name="image" size={28} />
          </span>
        )}
      </button>
      <button
        type="button"
        className="registered-image-action"
        data-testid={testId ? `${testId}:clear` : undefined}
        aria-label={translate('settings.registeredImagePicker.remove', { label: label })}
        title={translate('settings.registeredImagePicker.removeImage')}
        disabled={disabled || (!ref && !preview)}
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
