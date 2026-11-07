import { useEffect, useRef, useState } from 'react';
import type {
  GeneratedSound,
  SoundGenerationAction,
  SoundGenerationModel,
} from '../shared/sound-generation';
import { libraryBasename, libraryPath } from '../shared/library-assets';
import { useHostTranslation } from './HostTranslation';
import { SettingsModal, SettingsDialog } from './settings-ui/SettingsModal';
import { SettingsField, SettingsActions } from './settings-ui/SettingsSections';
import { SettingsInput, SettingsTextarea } from './settings-ui/SettingsInput';
import { SettingsButton } from './settings-ui/SettingsButton';
import { Icon } from './Icon';
import './sound-generation.css';

export function SoundGenerationDialog({
  model,
  returnFocus,
}: {
  model: SoundGenerationModel;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useHostTranslation();
  const [folder, setFolder] = useState(model.draft?.folder ?? model.folder);
  const [serverId, setServerId] = useState(
    model.draft?.serverId ?? model.defaultConnectionId ?? '',
  );
  const [text, setText] = useState(model.draft?.text ?? '');
  const [useDefault, setUseDefault] = useState(model.draft?.useDefault ?? true);
  const [instructions, setInstructions] = useState(model.draft?.instructions ?? '');
  const [discard, setDiscard] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const running = useRef(new Set<string>());
  const [edit, setEdit] = useState<{ kind: 'rename' | 'delete'; item: GeneratedSound } | null>(
    null,
  );
  const [name, setName] = useState('');
  const server = model.servers.find((s) => s.id === serverId);
  const busy = model.closing;
  const act = async (action: SoundGenerationAction) => {
    setError('');
    await window.dock.soundGeneration.act(model.id, action);
  };
  const run = (action: SoundGenerationAction) => {
    const key = 'itemId' in action ? action.itemId : action.kind;
    if (running.current.has(key)) return;
    running.current.add(key);
    setPending(new Set(running.current));
    void act(action)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        running.current.delete(key);
        setPending(new Set(running.current));
      });
  };
  useEffect(() => {
    void window.dock.soundGeneration
      .act(model.id, { kind: 'draft', draft: { folder, serverId, text, useDefault, instructions } })
      .catch(() => {});
  }, [folder, serverId, text, useDefault, instructions]);
  const close = () => {
    void act({ kind: 'close' }).catch((e) => setError(String(e)));
  };
  const heading = `sound-generation-${model.id}`;
  return (
    <>
      <SettingsModal
        className="sound-generation-dialog"
        bodyClassName="settings-dialog-body sound-generation-body"
        labelledBy={heading}
        returnFocus={returnFocus}
        onClose={close}
        closeDisabled={busy}
        collapseStatusWhenEmpty
        error={error || model.error}
        header={
          <header>
            <h2 id={heading}>{t('soundGeneration.title')}</h2>
            <p>{t('soundGeneration.autoSave')}</p>
          </header>
        }
        footer={
          <footer>
            <span className="sound-generation-footer-note">
              {t('soundGeneration.keepAfterClose')}
            </span>
            <SettingsButton disabled={busy} onClick={close}>
              {t('common.close')}
            </SettingsButton>
            {model.error && (
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
              disabled={busy}
              onChange={(e) => setFolder(e.target.value)}
            >
              {!model.folders.includes(folder) && <option value={folder}>{folder}</option>}
              {model.folders.map((value) => (
                <option key={value} value={value}>
                  {value || t('soundGeneration.rootFolder')}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            title={t('soundGeneration.server')}
            description={
              !model.servers.length
                ? t('soundGeneration.configure')
                : !server?.ready
                  ? t('soundGeneration.chooseServer')
                  : undefined
            }
          >
            <select
              aria-label={t('soundGeneration.server')}
              value={serverId}
              disabled={busy}
              onChange={(e) => setServerId(e.target.value)}
            >
              <option value="" disabled>
                {t('soundGeneration.chooseServer')}
              </option>
              {model.servers.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={t('soundGeneration.text')}>
            <SettingsTextarea
              data-initial-focus
              newlineOnEnter
              commitOn="input"
              aria-label={t('soundGeneration.text')}
              rows={4}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            title={t('soundGeneration.instructions')}
            description={
              server && !server.supportsInstructions
                ? t('soundGeneration.instructionsDisabled')
                : undefined
            }
          >
            <label className="sound-generation-default">
              <input
                type="checkbox"
                checked={useDefault}
                disabled={busy || !server?.supportsInstructions}
                onChange={(e) => setUseDefault(e.target.checked)}
              />
              {t('soundGeneration.useDefault')}
            </label>
            <SettingsTextarea
              newlineOnEnter
              commitOn="input"
              aria-label={t('soundGeneration.instructions')}
              rows={2}
              value={useDefault ? (server?.instructions ?? '') : instructions}
              disabled={busy || useDefault || !server?.supportsInstructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </SettingsField>
          <SettingsActions>
            <SettingsButton
              className="primary"
              disabled={
                busy ||
                pending.has('generate') ||
                !server?.ready ||
                !text.trim() ||
                !model.folders.includes(folder)
              }
              onClick={() =>
                run({
                  kind: 'generate',
                  folder,
                  connectionId: serverId,
                  text,
                  ...(useDefault ? {} : { instructions }),
                })
              }
            >
              {t('soundGeneration.generate')}
            </SettingsButton>
          </SettingsActions>
        </div>
        <section className="sound-generation-results" aria-labelledby={`${heading}-results`}>
          <h3 id={`${heading}-results`}>
            {t('soundGeneration.results', { count: model.items.length })}
          </h3>
          {model.items.map((item) => {
            const playback = model.playback?.file === item.file ? model.playback : undefined;
            const itemBusy = busy || item.busy || pending.has(item.id);
            const cancellable = item.state === 'queued' || item.state === 'generating';
            const statusKey = (
              {
                queued: 'soundGeneration.queued',
                generating: 'soundGeneration.generating',
                saving: 'soundGeneration.saving',
                saved: null,
                unsaved: 'soundGeneration.unsaved',
                changed: 'soundGeneration.changed',
                failed: 'soundGeneration.failed',
                canceled: 'soundGeneration.canceled',
              } as const
            )[item.state];
            const folderName = item.folder || t('soundGeneration.rootFolder');
            const status = playback
              ? t(
                  playback.state === 'playing'
                    ? 'sounds.playing'
                    : playback.state === 'waiting'
                      ? 'sounds.waiting'
                      : 'sounds.loading',
                )
              : statusKey
                ? t(statusKey)
                : undefined;
            const information = [
              status,
              folderName,
              ...(item.seconds === undefined
                ? []
                : ['WAV', t('soundGeneration.seconds', { seconds: item.seconds.toFixed(1) })]),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                className="sound-generation-item"
                key={item.id}
                data-generated-sound={item.id}
                aria-busy={itemBusy}
              >
                <SettingsField
                  title={item.file ? libraryBasename(item.file) : item.text}
                  error={item.error}
                >
                  <div role="status" className="sound-generation-status" title={information}>
                    <span
                      className="settings-action-spinner"
                      data-pending={item.busy && item.state !== 'queued'}
                      aria-hidden="true"
                    />
                    <span className="sound-generation-information">{information}</span>
                  </div>
                  <SettingsActions className="sound-generation-actions">
                    {cancellable && (
                      <SettingsButton
                        icon
                        aria-label={t(
                          item.state === 'queued'
                            ? 'common.cancel'
                            : 'soundGeneration.cancelGeneration',
                        )}
                        title={t(
                          item.state === 'queued'
                            ? 'common.cancel'
                            : 'soundGeneration.cancelGeneration',
                        )}
                        disabled={busy || pending.has(item.id)}
                        onClick={() => run({ kind: 'cancel', itemId: item.id })}
                      >
                        <Icon name={item.state === 'queued' ? 'close' : 'square'} size={18} />
                      </SettingsButton>
                    )}
                    {item.state === 'saved' && (
                      <>
                        <SettingsButton
                          icon
                          aria-label={playback ? t('sounds.stop') : t('sounds.play')}
                          title={playback ? t('sounds.stop') : t('sounds.play')}
                          disabled={!playback && itemBusy}
                          onClick={() =>
                            playback
                              ? void act({ kind: 'stop' }).catch((e) => setError(String(e)))
                              : run({ kind: 'play', itemId: item.id })
                          }
                        >
                          <Icon name={playback ? 'square' : 'play'} size={18} />
                        </SettingsButton>
                        <SettingsButton
                          icon
                          aria-label={t('soundGeneration.rename')}
                          title={t('soundGeneration.rename')}
                          disabled={itemBusy}
                          onClick={() => {
                            setName(libraryBasename(item.file!).replace(/\.wav$/i, ''));
                            setEdit({ kind: 'rename', item });
                          }}
                        >
                          <Icon name="edit" size={18} />
                        </SettingsButton>
                        <SettingsButton
                          icon
                          aria-label={t('common.delete')}
                          title={t('common.delete')}
                          disabled={itemBusy}
                          onClick={() => setEdit({ kind: 'delete', item })}
                        >
                          <Icon name="trash" size={18} />
                        </SettingsButton>
                      </>
                    )}
                    {!itemBusy && item.hasResult && (
                      <SettingsButton
                        icon
                        aria-label={t('generationJobs.export')}
                        title={t('generationJobs.export')}
                        onClick={() => run({ kind: 'export', itemId: item.id })}
                      >
                        <Icon name="download" size={18} />
                      </SettingsButton>
                    )}
                    {!itemBusy && item.state === 'failed' && item.hasResult && (
                      <SettingsButton
                        icon
                        aria-label={t('soundGeneration.regenerate')}
                        title={t('soundGeneration.regenerate')}
                        onClick={() => run({ kind: 'regenerate', itemId: item.id })}
                      >
                        <Icon name="refresh" size={18} />
                      </SettingsButton>
                    )}
                    {item.canRetry && (
                      <SettingsButton
                        icon
                        aria-label={t(
                          !item.hasResult && ['failed', 'canceled'].includes(item.state)
                            ? 'soundGeneration.regenerate'
                            : 'soundGeneration.retrySave',
                        )}
                        title={t(
                          !item.hasResult && ['failed', 'canceled'].includes(item.state)
                            ? 'soundGeneration.regenerate'
                            : 'soundGeneration.retrySave',
                        )}
                        disabled={itemBusy || item.state === 'changed'}
                        onClick={() => run({ kind: 'retry', itemId: item.id })}
                      >
                        <Icon
                          name={
                            !item.hasResult && ['failed', 'canceled'].includes(item.state)
                              ? 'refresh'
                              : 'download'
                          }
                          size={18}
                        />
                      </SettingsButton>
                    )}
                    {!item.hasResult && ['failed', 'canceled'].includes(item.state) && (
                      <SettingsButton
                        icon
                        aria-label={t('soundGeneration.dismiss')}
                        title={t('soundGeneration.dismiss')}
                        disabled={itemBusy}
                        onClick={() => run({ kind: 'dismiss', itemId: item.id })}
                      >
                        <Icon name="close" size={18} />
                      </SettingsButton>
                    )}
                  </SettingsActions>
                  <details>
                    <summary>{t('soundGeneration.conditions')}</summary>
                    <dl className="sound-generation-conditions">
                      {item.file && (
                        <>
                          <dt>{t('soundGeneration.filename')}</dt>
                          <dd>{libraryBasename(item.file)}</dd>
                        </>
                      )}
                      <dt>{t('soundGeneration.folder')}</dt>
                      <dd>{folderName}</dd>
                      <dt>{t('soundGeneration.text')}</dt>
                      <dd>{item.text}</dd>
                      <dt>{t('soundGeneration.server')}</dt>
                      <dd>{item.server}</dd>
                      {item.instructions && (
                        <>
                          <dt>{t('soundGeneration.instructions')}</dt>
                          <dd>{item.instructions}</dd>
                        </>
                      )}
                    </dl>
                    <SettingsActions>
                      <SettingsButton disabled={itemBusy} onClick={() => setDiscard(item.id)}>
                        {t('generationJobs.discard')}
                      </SettingsButton>
                    </SettingsActions>
                  </details>
                </SettingsField>
              </div>
            );
          })}
        </section>
      </SettingsModal>
      {discard && (
        <SettingsDialog
          title={t('generationJobs.discard')}
          description={t('generationJobs.discardConfirm')}
          applyLabel={t('common.delete')}
          onClose={() => setDiscard(undefined)}
          onApply={async () => {
            await act({ kind: 'discard', itemId: discard });
            setDiscard(undefined);
          }}
        >
          {null}
        </SettingsDialog>
      )}
      {edit && (
        <SettingsDialog
          title={t(edit.kind === 'rename' ? 'soundGeneration.rename' : 'common.delete')}
          description={
            edit.kind === 'delete'
              ? t('soundGeneration.deleteConfirm', { name: libraryBasename(edit.item.file!) })
              : edit.item.file
          }
          onClose={() => setEdit(null)}
          valid={
            edit.kind === 'delete' ||
            (!!name.trim() && !name.includes('/') && libraryPath(name.trim() + '.wav', 'sound'))
          }
          applyLabel={t(edit.kind === 'delete' ? 'soundGeneration.trash' : 'common.apply')}
          onApply={async () => {
            await act(
              edit.kind === 'rename'
                ? { kind: 'rename', itemId: edit.item.id, name: name.trim() + '.wav' }
                : { kind: 'delete', itemId: edit.item.id },
            );
          }}
        >
          {edit.kind === 'rename' && (
            <SettingsField title={t('soundGeneration.name')}>
              <SettingsInput
                data-initial-focus
                aria-label={t('soundGeneration.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </SettingsField>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
