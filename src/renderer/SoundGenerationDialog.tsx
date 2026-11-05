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
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const [edit, setEdit] = useState<{ kind: 'rename' | 'delete'; item: GeneratedSound } | null>(
    null,
  );
  const [name, setName] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const server = model.servers.find((s) => s.id === serverId);
  const busy = pending || model.phase !== 'idle';
  const act = async (action: SoundGenerationAction) => {
    setError('');
    await window.dock.soundGeneration.act(model.id, action);
  };
  const run = (action: SoundGenerationAction) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    void act(action)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        running.current = false;
        setPending(false);
      });
  };
  const close = () => {
    if (busy || model.items.some((item) => item.state === 'unsaved')) setConfirmClose(true);
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
        closeDisabled={model.phase === 'saving' || model.phase === 'editing'}
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
            <SettingsButton
              disabled={model.phase === 'saving' || model.phase === 'editing'}
              onClick={close}
            >
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
          <SettingsField
            title={t('soundGeneration.generate')}
            description={
              model.phase === 'generating'
                ? t('soundGeneration.generating')
                : model.phase === 'saving'
                  ? t('soundGeneration.saving')
                  : undefined
            }
          >
            <SettingsActions>
              <SettingsButton
                appearance="filled"
                disabled={busy || !server?.ready || !text.trim() || !model.folders.includes(folder)}
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
              {model.phase === 'generating' && (
                <SettingsButton
                  onClick={() => void act({ kind: 'cancel' }).catch((e) => setError(String(e)))}
                >
                  {t('soundGeneration.cancelGeneration')}
                </SettingsButton>
              )}
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
            return (
              <div className="sound-generation-item" key={item.id} data-generated-sound={item.id}>
                <SettingsField
                  title={item.file ? libraryBasename(item.file) : t('soundGeneration.unsaved')}
                  error={item.error}
                  description={`${t(item.state === 'changed' ? 'soundGeneration.changed' : item.state === 'saved' ? 'soundGeneration.saved' : 'soundGeneration.unsaved')} · WAV · ${t('soundGeneration.seconds', { seconds: item.seconds.toFixed(1) })}`}
                >
                  <div className="sound-generation-note">
                    {item.folder || t('soundGeneration.rootFolder')}
                  </div>
                  <SettingsActions>
                    <SettingsButton
                      disabled={!playback && (busy || item.state !== 'saved')}
                      onClick={() =>
                        playback
                          ? void act({ kind: 'stop' }).catch((e) => setError(String(e)))
                          : run({ kind: 'play', itemId: item.id })
                      }
                    >
                      {playback ? t('sounds.stop') : t('sounds.play')}
                    </SettingsButton>
                    <SettingsButton
                      disabled={busy || item.state !== 'saved'}
                      onClick={() => {
                        setName(libraryBasename(item.file!).replace(/\.wav$/i, ''));
                        setEdit({ kind: 'rename', item });
                      }}
                    >
                      {t('soundGeneration.rename')}
                    </SettingsButton>
                    <SettingsButton
                      disabled={busy || item.state !== 'saved'}
                      onClick={() => setEdit({ kind: 'delete', item })}
                    >
                      {t('common.delete')}
                    </SettingsButton>
                    {item.canRetry && (
                      <SettingsButton
                        disabled={busy || item.state === 'changed'}
                        onClick={() => run({ kind: 'retry', itemId: item.id })}
                      >
                        {t('common.retry')}
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
