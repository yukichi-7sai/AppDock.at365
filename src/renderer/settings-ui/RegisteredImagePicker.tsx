import { assignedImage } from '../../shared/image-paths';
import { hostText } from '../../shared/i18n';
import {
  LibraryMediaProvider,
  useLibraryMedia,
  useLibraryTranslation,
} from '../image-browser/LibraryMedia';
import { libraryReference } from '../../shared/library-assets';
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
import { SettingsDialog } from './SettingsModal';
import { LibraryPreviewDialog } from './LibraryPreviewDialog';
import { ImageGalleryPreview } from './ImageGallery';
import { libraryGallerySize } from '../../shared/image-gallery';
import {
  defaultImageLibraryLayout,
  type ImageLibraryLayout,
} from '../../shared/image-library-page';
import { ImagePickerBrowser } from '../image-browser/ImagePickerBrowser';
import { Icon } from '../Icon';
import './registered-images.css';
import { externalLibraryLocation } from '../../shared/library-sources';

const ImagesContext = createContext<ImageLibraryApi | undefined>(undefined);
export function RegisteredImagesProvider({
  api,
  children,
}: {
  api: ImageLibraryApi;
  children: ReactNode;
}) {
  return (
    <ImagesContext.Provider value={api}>
      <LibraryMediaProvider media={api.media ?? 'image'}>{children}</LibraryMediaProvider>
    </ImagesContext.Provider>
  );
}
export const useRegisteredImages = () => useContext(ImagesContext);
/** Each mounted image surface releases only its own host cache ownership. */
export function useImageSession(api: ImageLibraryApi | undefined) {
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
  const { t: translate } = useLibraryTranslation();
  const api = useRegisteredImages();
  const images = useImageSession(api);
  const [url, setUrl] = useState<string | null>(null);
  const file = libraryReference(value, api?.media ?? 'image') ? value.file : '';
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
type ImagePickerProps = {
  onClose(): void;
} & (
  | {
      multiple?: false;
      current: RegisteredImageRef | null;
      onSelect(image: RegisteredImageRef | null, sourceName?: string): Promise<unknown> | void;
    }
  | {
      multiple: true;
      current: RegisteredImageRef[];
      onSelect(images: RegisteredImageRef[]): Promise<unknown> | void;
      selectionError?(images: RegisteredImageRef[]): string;
    }
);
export function RegisteredImagePicker(props: ImagePickerProps) {
  const { onClose } = props;
  const { t: translate } = useLibraryTranslation();
  const library = useImageLibrary();
  const media = useLibraryMedia();
  useEffect(
    () => () => {
      void library.api?.stop?.().catch(() => {});
    },
    [library.api],
  );
  const [selected, setSelected] = useState(props.multiple ? null : props.current),
    [folder, setFolder] = useState('*'),
    [group, setGroup] = useState('all'),
    [query, setQuery] = useState(''),
    [registering, setRegistering] = useState(false);
  const [selectedImages, setSelectedImages] = useState(props.multiple ? props.current : []);
  const selectionError = props.multiple ? (props.selectionError?.(selectedImages) ?? '') : '';
  const choose = (ref: RegisteredImageRef) => {
    if (props.multiple)
      setSelectedImages((images) =>
        images.some((image) => image.file === ref.file)
          ? images.filter((image) => image.file !== ref.file)
          : [...images, ref],
      );
    else setSelected(ref);
  };
  const applied = useRef(false);
  const [reveal, setReveal] = useState<RegisteredImageRef | null>(null);
  const imageSession = useImageSession(library.api);
  const [cardWidth, setCardWidth] = useState<number>(libraryGallerySize.initial);
  const [layout, setLayout] = useState<ImageLibraryLayout>(defaultImageLibraryLayout);
  const [viewErrors, setViewErrors] = useState({ load: '', width: '', layout: '' });
  const viewError = [...new Set(Object.values(viewErrors).filter(Boolean))].join('\n');
  const [preview, setPreview] = useState<RegisteredImageEntry | null>(null);
  const touched = useRef({ width: false, layout: false });
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    void library.api
      ?.galleryView()
      .then((view) => {
        if (!live) return;
        if (!touched.current.width) setCardWidth(view.cardWidth);
        if (!touched.current.layout) setLayout(view.layout);
        setViewErrors((errors) => ({ ...errors, load: view.error }));
      })
      .catch(() => {
        if (live)
          setViewErrors((errors) => ({
            ...errors,
            load: translate('settings.registeredImagePicker.viewUnreadable'),
          }));
      });
    return () => {
      live = false;
    };
  }, [library.api]);
  const saveView = (kind: 'width' | 'layout', save: () => Promise<void> | undefined) => {
    touched.current[kind] = true;
    saves.current = saves.current
      .catch(() => {})
      .then(async () => {
        try {
          await save();
          setViewErrors((errors) => ({ ...errors, load: '', [kind]: '' }));
        } catch (error) {
          setViewErrors((errors) => ({
            ...errors,
            [kind]: error instanceof Error ? error.message : String(error),
          }));
        }
      });
  };
  const saveWidth = (value: number) =>
    saveView('width', () => library.api?.saveGalleryWidth(value));
  const saveLayout = (value: ImageLibraryLayout) => {
    setLayout(value);
    saveView('layout', () => library.api?.saveGalleryLayout(value));
  };
  const register = async () => {
    setRegistering(true);
    library.setError('');
    try {
      const ref = await library.api!.register();
      if (ref) {
        if (props.multiple)
          setSelectedImages((images) =>
            images.some((image) => image.file === ref.file) ? images : [...images, ref],
          );
        else setSelected(ref);
        setGroup('all');
        setFolder('*');
        setQuery('');
        await library.reload();
        setReveal({ ...ref });
      }
    } catch (e) {
      library.setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRegistering(false);
    }
  };
  return (
    <SettingsMcpAccessProvider value={undefined}>
      <SettingsDialog
        title={translate('settings.registeredImagePicker.select')}
        description={translate('settings.registeredImagePicker.keepOriginal')}
        error={[selectionError, library.error, viewError].filter(Boolean).join('\n')}
        errorTarget={translate('settings.registeredImagePicker.selection')}
        errorAction={
          viewError ? (
            <button
              type="button"
              onClick={() => {
                saveWidth(cardWidth);
                saveLayout(layout);
              }}
            >
              {translate('settings.registeredImagePicker.retry')}
            </button>
          ) : undefined
        }
        className="image-library-dialog image-picker-dialog"
        collapseStatusWhenEmpty
        secondaryAction={{
          label: translate('settings.registeredImagePicker.register'),
          disabled: !library.api || !!externalLibraryLocation(folder),
          pending: registering,
          onClick: () => void register(),
        }}
        footerContent={
          <div className="image-picker-summary">
            {props.multiple && (
              <span role="status">
                {translate('images.imageCount', { count: selectedImages.length })}
              </span>
            )}
            {media === 'sound' && (
              <SoundPickerControls
                api={library.api}
                selected={selected}
                snapshot={library.snapshot}
                onError={library.setError}
              />
            )}
            {!props.multiple && (
              <>
                <div
                  className="image-picker-selected-preview"
                  data-svg={!!selected && /\.svg$/i.test(selected.file)}
                >
                  <RegisteredImagePreview
                    value={selected}
                    label={translate('settings.registeredImagePicker.selection')}
                  />
                </div>
                <span
                  className="image-picker-filename"
                  data-testid="image-picker-filename"
                  title={selected && !assignedImage(selected.file) ? selected.file : undefined}
                >
                  {selected
                    ? assignedImage(selected.file)
                      ? translate('images.assigned')
                      : selected.file
                    : translate('settings.registeredImagePicker.none')}
                </span>
              </>
            )}
          </div>
        }
        applyLabel={translate('settings.registeredImagePicker.use')}
        valid={!!library.api && (props.multiple || !!selected) && !selectionError && !registering}
        onClose={() => {
          if (!applied.current) onClose();
        }}
        onApply={async () => {
          if (props.multiple) {
            await props.onSelect(selectedImages);
            applied.current = true;
            return;
          }
          if (!selected) return;
          await props.onSelect(
            library.api?.retain ? await library.api.retain(selected) : selected,
            selected.file.split('/').at(-1),
          );
          applied.current = true;
        }}
      >
        <ImagePickerBrowser
          snapshot={library.snapshot}
          selected={selected}
          selectedImages={props.multiple ? selectedImages : undefined}
          reveal={reveal}
          onSelect={choose}
          folder={folder}
          onFolder={setFolder}
          group={group}
          onGroup={setGroup}
          query={query}
          onQuery={setQuery}
          cardWidth={cardWidth}
          onWidth={(value) => {
            touched.current.width = true;
            setCardWidth(value);
          }}
          onSaveWidth={saveWidth}
          layout={layout}
          onLayout={(value) => {
            touched.current.layout = true;
            setLayout(value);
          }}
          onSaveLayout={saveLayout}
          disabled={registering}
          onPreview={(entry) => {
            if (media === 'sound')
              void library.api
                ?.play?.(entry.ref)
                .catch((error) =>
                  library.setError(String(error instanceof Error ? error.message : error)),
                );
            else setPreview(entry);
          }}
          image={imageSession.image}
          onReload={() => void library.reload()}
        />
        {preview && (
          <LibraryPreviewDialog
            title={preview.ref.file}
            className="image-library-preview-modal"
            onClose={() => setPreview(null)}
          >
            <RegisteredGalleryPreview entry={preview} groups={library.snapshot.groups} />
          </LibraryPreviewDialog>
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
  const { t: translate } = useLibraryTranslation();
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
  const { t: translate } = useLibraryTranslation();
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
          onSelect={async (image, name) => {
            await api?.completePick?.(request.id, {
              cancelled: false,
              image,
              ...(api?.media === 'sound' ? { name } : {}),
            });
            setRequest(null);
          }}
        />
      )}
    </>
  );
}

function SoundPickerControls({
  api,
  selected,
  snapshot,
  onError,
}: {
  api: ImageLibraryApi | undefined;
  selected: RegisteredImageRef | null;
  snapshot: ImageLibrarySnapshot;
  onError(value: string): void;
}) {
  const { t } = useLibraryTranslation();
  const playback = snapshot.playback;
  return (
    <div className="sound-picker-controls">
      <button
        type="button"
        disabled={!selected || !api}
        onClick={() => {
          if (selected)
            void api
              ?.play?.(selected)
              .catch((e) => onError(String(e instanceof Error ? e.message : e)));
        }}
      >
        {t('sounds.play')}
      </button>
      <button
        type="button"
        disabled={!playback}
        onClick={() => void api?.stop?.().catch((e) => onError(String(e)))}
      >
        {t('sounds.stop')}
      </button>
      <span role="status">
        {playback
          ? t(
              playback.state === 'playing'
                ? 'sounds.playing'
                : playback.state === 'waiting'
                  ? 'sounds.waiting'
                  : 'sounds.loading',
            )
          : ''}
      </span>
    </div>
  );
}
