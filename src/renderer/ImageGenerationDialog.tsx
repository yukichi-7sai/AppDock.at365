import { libraryFolderLabel } from '../shared/library-sources';
import { useEffect, useRef, useState } from 'react';
import type { ImageGenerationAction, ImageGenerationModel } from '../shared/image-generation';
import { imageQualities, type ImageFormat } from '../shared/image-ai';
import {
  libraryBasename,
  libraryPath,
  type LibraryEntry,
  type LibraryRef,
} from '../shared/library-assets';
import { ImageGenerationReferences, imageReferencesValid } from './ImageGenerationReferences';
import { useHostTranslation } from './HostTranslation';
import { SettingsModal, SettingsDialog } from './settings-ui/SettingsModal';
import { SettingsField, SettingsActions } from './settings-ui/SettingsSections';
import { SettingsInput, SettingsTextarea } from './settings-ui/SettingsInput';
import { SettingsButton } from './settings-ui/SettingsButton';
import { Icon } from './Icon';
import { LibraryPreviewDialog } from './settings-ui/LibraryPreviewDialog';
import {
  RegisteredGalleryPreview,
  useImageSession,
  useRegisteredImages,
  useImageLibrary,
} from './settings-ui/RegisteredImagePicker';
import './sound-generation.css';
import './image-generation.css';

function Thumbnail({ entry }: { entry: LibraryEntry }) {
  const session = useImageSession(useRegisteredImages());
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void session
      .image(entry.ref, entry.generation!, 512)
      .then((source) => {
        if (live) setSource(source);
      })
      .catch((e) => {
        if (live) setError(String(e.message ?? e));
      });
    return () => {
      live = false;
    };
  }, [entry.ref.file, entry.generation]);
  return source ? <img src={source} alt="" /> : <span>{error}</span>;
}

export function ImageGenerationDialog({
  model,
  returnFocus,
}: {
  model: ImageGenerationModel;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useHostTranslation();
  const library = useImageLibrary();
  const [folder, setFolder] = useState(model.draft?.folder ?? model.folder);
  const [serverId, setServerId] = useState(
    model.draft?.serverId ?? model.defaultConnectionId ?? '',
  );
  const [input, setInput] = useState(model.draft?.input ?? '');
  const [name, setName] = useState(model.draft?.name ?? '');
  const [referenceImages, setReferenceImages] = useState<LibraryRef[]>(() =>
    model.initialReferenceImages.length
      ? model.initialReferenceImages
      : (model.draft?.referenceImages ?? []),
  );
  const [quality, setQuality] = useState<string | undefined>(model.draft?.quality);
  const [size, setSize] = useState<string | undefined>(model.draft?.size);
  const [count, setCount] = useState<string | undefined>(model.draft?.count);
  const [format, setFormat] = useState<ImageFormat | undefined>(model.draft?.format);
  const [discard, setDiscard] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const [preview, setPreview] = useState<LibraryEntry | null>(null);
  const [edit, setEdit] = useState<{
    kind: 'rename' | 'delete';
    jobId: string;
    imageId: string;
    entry: LibraryEntry;
  } | null>(null);
  const [rename, setRename] = useState('');
  const server = model.servers.find((s) => s.id === serverId);
  const act = (action: ImageGenerationAction) => window.dock.imageGeneration.act(model.id, action);
  useEffect(() => {
    void act({
      kind: 'draft',
      draft: { folder, serverId, input, name, referenceImages, quality, size, count, format },
    }).catch(() => {});
  }, [folder, serverId, input, name, referenceImages, quality, size, count, format]);
  const run = (action: ImageGenerationAction) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    void act(action)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => {
        running.current = false;
        setPending(false);
      });
  };
  const close = () => run({ kind: 'close' });
  const heading = 'image-generation-' + model.id;
  return (
    <>
      <SettingsModal
        className="sound-generation-dialog image-generation-dialog"
        bodyClassName="settings-dialog-body sound-generation-body"
        labelledBy={heading}
        returnFocus={returnFocus}
        onClose={close}
        closeDisabled={pending}
        collapseStatusWhenEmpty
        error={error || model.recoveryError}
        header={
          <header>
            <h2 id={heading}>{t('imageGeneration.title')}</h2>
            <p>{t('imageGeneration.autoSave')}</p>
          </header>
        }
        footer={
          <footer>
            <span className="sound-generation-footer-note">
              {t('imageGeneration.keepAfterClose')}
            </span>
            <SettingsButton disabled={pending} onClick={close}>
              {t('common.close')}
            </SettingsButton>
            {model.recoveryError && (
              <SettingsButton onClick={() => run({ kind: 'recoveryFolder' })}>
                {t('generationJobs.recoveryFolder')}
              </SettingsButton>
            )}
          </footer>
        }
      >
        <div className="sound-generation-form">
          <SettingsField title={t('soundGeneration.folder')}>
            <select
              aria-label={t('soundGeneration.folder')}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              {model.folders.map((folder) => (
                <option key={folder} value={folder}>
                  {libraryFolderLabel(folder, model.sources ?? [], t('library.sources.direct')) ||
                    t('imageGeneration.rootFolder')}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            title={t('imageGeneration.server')}
            description={!model.servers.length ? t('imageGeneration.configure') : undefined}
          >
            <select
              aria-label={t('imageGeneration.server')}
              value={serverId}
              onChange={(e) => {
                setServerId(e.target.value);
                setSize(undefined);
                setCount(undefined);
                setFormat(undefined);
                setQuality(undefined);
              }}
            >
              <option value="" disabled>
                {t('imageGeneration.chooseServer')}
              </option>
              {model.servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={t('imageGeneration.input')}>
            <SettingsTextarea
              data-initial-focus
              commitOn="input"
              newlineOnEnter
              rows={3}
              aria-label={t('imageGeneration.input')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </SettingsField>
          <ImageGenerationReferences
            value={referenceImages}
            entries={library.snapshot.images}
            onChange={setReferenceImages}
            onPreview={setPreview}
          />
          <SettingsField
            title={t('imageGeneration.name')}
            description={t('imageGeneration.nameHint')}
          >
            <SettingsInput
              aria-label={t('imageGeneration.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </SettingsField>
          <div className="image-generation-options">
            <SettingsField
              title={t('imageAi.quality')}
              description={t('imageGeneration.qualityDefaultHint', {
                quality: server?.defaults.providerOptions.quality ?? 'auto',
              })}
            >
              <select
                aria-label={t('imageAi.quality')}
                value={quality ?? ''}
                onChange={(e) => setQuality(e.target.value || undefined)}
              >
                <option value="">{t('imageGeneration.qualityDefault')}</option>
                {imageQualities.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </SettingsField>
            <SettingsField title={t('imageAi.size')}>
              <SettingsInput
                aria-label={t('imageAi.size')}
                value={size ?? server?.defaults.size ?? ''}
                onChange={(e) => setSize(e.target.value)}
              />
            </SettingsField>
            <SettingsField title={t('imageAi.count')}>
              <SettingsInput
                type="number"
                min={1}
                max={10}
                aria-label={t('imageAi.count')}
                value={count ?? server?.defaults.count ?? 1}
                onChange={(e) => setCount(e.target.value)}
              />
            </SettingsField>
            <SettingsField title={t('imageAi.format')}>
              <select
                aria-label={t('imageAi.format')}
                value={format ?? server?.defaults.format ?? 'png'}
                onChange={(e) => setFormat(e.target.value as ImageFormat)}
              >
                {['png', 'jpeg', 'webp'].map((format) => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </SettingsField>
          </div>
          <SettingsActions>
            <SettingsButton
              className="primary"
              disabled={
                pending ||
                !server ||
                !input.trim() ||
                !model.folders.includes(folder) ||
                !imageReferencesValid(referenceImages, library.snapshot.images)
              }
              onClick={() =>
                run({
                  kind: 'generate',
                  folder,
                  ...(name.trim() ? { name: name.trim() } : {}),
                  input: {
                    requestId: crypto.randomUUID(),
                    connectionId: serverId,
                    input,
                    ...(referenceImages.length ? { referenceImages } : {}),
                    options: {
                      ...(size === undefined ? {} : { size }),
                      ...(count === undefined ? {} : { count: Number(count) }),
                      ...(format === undefined ? {} : { format }),
                      ...(quality === undefined ? {} : { providerOptions: { quality } }),
                    },
                  },
                })
              }
            >
              {t('imageGeneration.generate')}
            </SettingsButton>
          </SettingsActions>
        </div>
        <section className="sound-generation-results" aria-labelledby={heading + '-results'}>
          <h3 id={heading + '-results'}>
            {t('soundGeneration.results', { count: model.items.length })}
          </h3>
          {model.items.map((item) => {
            const busy = item.busy || ['queued', 'running', 'saving'].includes(item.job.state);
            return (
              <article
                key={item.job.jobId}
                className="sound-generation-item"
                data-job-id={item.job.jobId}
              >
                <SettingsButton
                  icon
                  className="generation-job-dismiss"
                  aria-label={t('generationJobs.remove')}
                  title={t('generationJobs.remove')}
                  disabled={pending || busy}
                  onClick={() => run({ kind: 'dismiss', jobId: item.job.jobId })}
                >
                  <Icon name="close" size={18} />
                </SettingsButton>
                <strong>{item.input}</strong>
                <p role="status">{t(`imageGeneration.state.${item.job.state}`)}</p>
                {item.resultsDeleted && <p>{t('generationJobs.resultsDeleted')}</p>}
                {item.job.error && <p role="alert">{item.job.error.message}</p>}
                {item.job.state === 'unsaved' && item.job.resultExpired && (
                  <p>{t('imageAi.expired')}</p>
                )}
                {item.entries.map(({ id, entry, changed }) => (
                  <div className="image-generation-result" key={id}>
                    <button
                      className="image-generation-thumbnail"
                      disabled={changed}
                      aria-label={t('imageGeneration.preview', {
                        name: libraryBasename(entry.ref.file),
                      })}
                      onClick={() => setPreview(entry)}
                    >
                      <Thumbnail entry={entry} />
                    </button>
                    <div className="sound-generation-information" title={entry.ref.file}>
                      {entry.ref.file}
                    </div>
                    {changed && <p>{t('soundGeneration.changed')}</p>}
                    <SettingsActions>
                      <SettingsButton
                        disabled={pending || busy || changed || item.job.state === 'unsaved'}
                        onClick={() => {
                          setRename(libraryBasename(entry.ref.file));
                          setEdit({ kind: 'rename', jobId: item.job.jobId, imageId: id, entry });
                        }}
                      >
                        {t('soundGeneration.rename')}
                      </SettingsButton>
                      <SettingsButton
                        disabled={pending || busy || changed || item.job.state === 'unsaved'}
                        onClick={() =>
                          setEdit({ kind: 'delete', jobId: item.job.jobId, imageId: id, entry })
                        }
                      >
                        {t('common.delete')}
                      </SettingsButton>
                    </SettingsActions>
                  </div>
                ))}
                <SettingsActions>
                  {!busy && !!item.job.images?.length && (
                    <SettingsButton disabled={pending} onClick={() => setDiscard(item.job.jobId)}>
                      {t('generationJobs.deleteImages')}
                    </SettingsButton>
                  )}
                  {!busy && !!item.job.images?.length && (
                    <SettingsButton
                      disabled={pending}
                      onClick={() => run({ kind: 'export', jobId: item.job.jobId })}
                    >
                      {t('generationJobs.export')}
                    </SettingsButton>
                  )}
                  {busy && (
                    <SettingsButton
                      disabled={pending}
                      onClick={() => run({ kind: 'cancel', jobId: item.job.jobId })}
                    >
                      {t('common.cancel')}
                    </SettingsButton>
                  )}
                  {!busy &&
                    item.job.images?.some(
                      (image) => !image.ref || image.registration === 'group-pending',
                    ) && (
                      <SettingsButton
                        disabled={pending}
                        onClick={() => run({ kind: 'retrySave', jobId: item.job.jobId })}
                      >
                        {t('soundGeneration.retrySave')}
                      </SettingsButton>
                    )}
                </SettingsActions>
                <details>
                  <summary>{t('soundGeneration.conditions')}</summary>
                  <dl className="sound-generation-conditions">
                    <dt>{t('imageGeneration.server')}</dt>
                    <dd>
                      {item.server} / {item.job.model}
                    </dd>
                    <dt>{t('soundGeneration.folder')}</dt>
                    <dd>
                      {libraryFolderLabel(
                        item.folder,
                        model.sources ?? [],
                        t('library.sources.direct'),
                      ) || t('imageGeneration.rootFolder')}
                    </dd>
                    <dt>
                      {t('imageGeneration.references', { count: item.referenceImages.length })}
                    </dt>
                    <dd>
                      {item.referenceImages
                        .map((ref, index) => `${index + 1}. ${ref.file}`)
                        .join('\n') || t('imageGeneration.noReferences')}
                    </dd>
                    <dt>{t('imageGeneration.input')}</dt>
                    <dd>{item.input}</dd>
                    <dt>{t('imageGeneration.options')}</dt>
                    <dd>
                      {item.options.size} · {item.options.count} · {item.options.format} ·{' '}
                      {item.options.providerOptions.quality} ·{' '}
                      {item.options.providerOptions.background}
                    </dd>
                  </dl>
                </details>
              </article>
            );
          })}
        </section>
      </SettingsModal>
      {edit && (
        <SettingsDialog
          title={t(edit.kind === 'rename' ? 'soundGeneration.rename' : 'common.delete')}
          description={
            edit.kind === 'delete'
              ? t('imageGeneration.deleteConfirm', { name: libraryBasename(edit.entry.ref.file) })
              : edit.entry.ref.file
          }
          onClose={() => setEdit(null)}
          valid={edit.kind === 'delete' || (!rename.includes('/') && libraryPath(rename, 'image'))}
          applyLabel={t(edit.kind === 'delete' ? 'soundGeneration.trash' : 'common.apply')}
          onApply={() =>
            act({
              kind: edit.kind,
              jobId: edit.jobId,
              imageId: edit.imageId,
              ...(edit.kind === 'rename' ? { name: rename } : {}),
            })
          }
        >
          {edit.kind === 'rename' && (
            <SettingsField title={t('imageGeneration.name')}>
              <SettingsInput
                data-initial-focus
                aria-label={t('imageGeneration.name')}
                value={rename}
                onChange={(e) => setRename(e.target.value)}
              />
            </SettingsField>
          )}
        </SettingsDialog>
      )}
      {discard && (
        <SettingsDialog
          title={t('generationJobs.deleteImages')}
          description={t('generationJobs.deleteImagesConfirm')}
          applyLabel={t('common.delete')}
          onClose={() => setDiscard(undefined)}
          onApply={async () => {
            await act({ kind: 'deleteResults', jobId: discard });
            setDiscard(undefined);
          }}
        >
          {null}
        </SettingsDialog>
      )}
      {preview && (
        <LibraryPreviewDialog
          title={preview.ref.file}
          className="image-library-preview-modal"
          onClose={() => setPreview(null)}
        >
          <RegisteredGalleryPreview entry={preview} groups={library.snapshot.groups} />
        </LibraryPreviewDialog>
      )}
    </>
  );
}
