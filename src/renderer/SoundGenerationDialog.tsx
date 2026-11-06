import { useRef, useState } from 'react';
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
import './sound-generation.css';

export function SoundGenerationDialog({
  model,
  returnFocus,
}: {
  model: SoundGenerationModel;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useHostTranslation();
  const [folder, setFolder] = useState(model.folder);
  const [serverId, setServerId] = useState(model.defaultConnectionId ?? '');
  const [text, setText] = useState('');
  const [useDefault, setUseDefault] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const running = useRef(new Set<string>());
  const [edit, setEdit] = useState<{ kind: 'rename' | 'delete'; item: GeneratedSound } | null>(
    null,
  );
  const [name, setName] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
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
  const close = () => {
    if (pending.size || model.items.some((item) => item.busy || item.state === 'unsaved'))
      setConfirmClose(true);
    else void act({ kind: 'close' }).catch((e) => setError(String(e)));
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
          <SettingsField title={t('soundGeneration.generate')}>
            <SettingsActions>
              <SettingsButton
                appearance="filled"
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
          </SettingsField>
        </div>
        <section className="sound-generation-results" aria-labelledby={`${heading}-results`}>
          <h3 id={`${heading}-results`}>
            {t('soundGeneration.results', { count: model.items.length })}
          </h3>
          <p className="sound-generation-note">{t('soundGeneration.sessionOnly')}</p>
          {!model.items.length && <p>{t('soundGeneration.empty')}</p>}
          {model.items.map((item) => {
            const playback = model.playback?.file === item.file ? model.playback : undefined;
            const itemBusy = busy || item.busy || pending.has(item.id);
            const cancellable = item.state === 'queued' || item.state === 'generating';
            const statusKey = (
              {
                queued: 'soundGeneration.queued',
                generating: 'soundGeneration.generating',
                saving: 'soundGeneration.saving',
                saved: 'soundGeneration.saved',
                unsaved: 'soundGeneration.unsaved',
                changed: 'soundGeneration.changed',
                failed: 'soundGeneration.failed',
                canceled: 'soundGeneration.canceled',
              } as const
            )[item.state];
            return (
              <div
                className="sound-generation-item"
                key={item.id}
                data-generated-sound={item.id}
                aria-busy={itemBusy}
              >
                <SettingsField
                  title={
                    item.file
                      ? libraryBasename(item.file)
                      : item.text.slice(0, 60) + (item.text.length > 60 ? '…' : '')
                  }
                  error={item.error}
                >
                  <div role="status" className="sound-generation-status">
                    {item.busy && item.state !== 'queued' && (
                      <span
                        className="settings-action-spinner"
                        data-pending="true"
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      {t(statusKey)}
                      {item.seconds !== undefined &&
                        ` · WAV · ${t('soundGeneration.seconds', { seconds: item.seconds.toFixed(1) })}`}
                    </span>
                  </div>
                  <div className="sound-generation-note">
                    {item.folder || t('soundGeneration.rootFolder')}
                  </div>
                  <SettingsActions>
                    {cancellable && (
                      <SettingsButton
                        disabled={busy || pending.has(item.id)}
                        onClick={() => run({ kind: 'cancel', itemId: item.id })}
                      >
                        {t(
                          item.state === 'queued'
                            ? 'common.cancel'
                            : 'soundGeneration.cancelGeneration',
                        )}
                      </SettingsButton>
                    )}
                    {item.state === 'saved' && (
                      <>
                        <SettingsButton
                          disabled={!playback && itemBusy}
                          onClick={() =>
                            playback
                              ? void act({ kind: 'stop' }).catch((e) => setError(String(e)))
                              : run({ kind: 'play', itemId: item.id })
                          }
                        >
                          {playback ? t('sounds.stop') : t('sounds.play')}
                        </SettingsButton>
                        <SettingsButton
                          disabled={itemBusy}
                          onClick={() => {
                            setName(libraryBasename(item.file!).replace(/\.wav$/i, ''));
                            setEdit({ kind: 'rename', item });
                          }}
                        >
                          {t('soundGeneration.rename')}
                        </SettingsButton>
                        <SettingsButton
                          disabled={itemBusy}
                          onClick={() => setEdit({ kind: 'delete', item })}
                        >
                          {t('common.delete')}
                        </SettingsButton>
                      </>
                    )}
                    {item.canRetry && (
                      <SettingsButton
                        disabled={itemBusy || item.state === 'changed'}
                        onClick={() => run({ kind: 'retry', itemId: item.id })}
                      >
                        {t(
                          ['failed', 'canceled'].includes(item.state)
                            ? 'soundGeneration.regenerate'
                            : 'soundGeneration.retrySave',
                        )}
                      </SettingsButton>
                    )}
                    {['failed', 'canceled'].includes(item.state) && (
                      <SettingsButton
                        disabled={itemBusy}
                        onClick={() => run({ kind: 'dismiss', itemId: item.id })}
                      >
                        {t('soundGeneration.dismiss')}
                      </SettingsButton>
                    )}
                  </SettingsActions>
                  {playback && (
                    <div role="status">
                      {t(
                        playback.state === 'playing'
                          ? 'sounds.playing'
                          : playback.state === 'waiting'
                            ? 'sounds.waiting'
                            : 'sounds.loading',
                      )}
                    </div>
                  )}
                  <details>
                    <summary>{t('soundGeneration.conditions')}</summary>
                    <div className="sound-generation-conditions">
                      {item.text}
                      <br />
                      {item.server}
                      {item.instructions && (
                        <>
                          <br />
                          {item.instructions}
                        </>
                      )}
                    </div>
                  </details>
                </SettingsField>
              </div>
            );
          })}
        </section>
      </SettingsModal>
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
      {confirmClose && (
        <SettingsDialog
          title={t('common.closeDialog')}
          description={t('soundGeneration.confirmClose')}
          onClose={() => setConfirmClose(false)}
          applyLabel={t('soundGeneration.discardClose')}
          onApply={() => act({ kind: 'close', discard: true })}
        >
          <span>{t('soundGeneration.keepAfterClose')}</span>
        </SettingsDialog>
      )}
    </>
  );
}
