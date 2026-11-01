import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { UiCommand } from '../../shared/commands';
import { commandSelectionCatalog, filterCommandSelection } from '../../shared/command-selection';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import { SettingsModal } from './SettingsModal';
import { SettingsInput } from './SettingsInput';
import { SettingsButton } from './SettingsButton';
import { SettingsListCount } from './SettingsListCount';
import { FilterSelect } from './FilterSelect';
import './command-selection-dialog.css';

const noPins: string[] = [];
export const CommandSelectionPins = createContext<string[] | undefined>(undefined);

/** Local selection draft. Only confirmation returns a command to the owning editor. */
export function CommandSelectionDialog({
  commands,
  pins: requestedPins,
  initialCommandId,
  onChoose,
  onClose,
}: {
  commands: UiCommand[];
  pins?: string[];
  initialCommandId?: string;
  onChoose(command: UiCommand): void | Promise<void>;
  onClose(): void;
}) {
  const { t } = useHostTranslation();
  const sharedPins = useContext(CommandSelectionPins);
  const pins = requestedPins ?? sharedPins ?? noPins;
  const prefix = useId();
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [selectedId, setSelectedId] = useState(initialCommandId);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const choosing = useRef(false);
  const composing = useRef(false);
  const live = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const browser = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; pointer: number } | null>(null);
  const [providerWidth, setProviderWidth] = useState(170);
  const [browserWidth, setBrowserWidth] = useState(0);
  const maximumProviderWidth = browserWidth ? Math.max(120, browserWidth - 252) : 170;
  const visibleProviderWidth = Math.min(providerWidth, maximumProviderWidth);
  const resizeProvider = (width: number) =>
    setProviderWidth(Math.round(Math.max(120, Math.min(maximumProviderWidth, width))));
  useLayoutEffect(() => {
    const element = browser.current;
    if (!element) return;
    const measure = () => setBrowserWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const catalog = useMemo(() => commandSelectionCatalog(commands, pins), [commands, pins]);
  const providers = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; count: number }>();
    for (const entry of catalog) {
      const existing = groups.get(entry.provider);
      if (existing) existing.count++;
      else
        groups.set(entry.provider, {
          id: entry.provider,
          title:
            entry.provider === 'custom'
              ? t('settings.commandSelection.custom')
              : entry.providerTitle,
          count: 1,
        });
    }
    return [
      { id: 'all', title: t('settings.commandSelection.all'), count: catalog.length },
      {
        id: 'favorites',
        title: t('settings.commandSelection.favorites'),
        count: catalog.filter((c) => c.favorite).length,
      },
      ...[...groups.values()].sort(
        (a, b) =>
          (a.id === 'host' ? -1 : a.id === 'custom' ? 0 : 1) -
            (b.id === 'host' ? -1 : b.id === 'custom' ? 0 : 1) ||
          a.title.localeCompare(b.title, 'ja'),
      ),
    ];
  }, [catalog, t]);
  const filtered = useMemo(
    () => filterCommandSelection(catalog, query, provider),
    [catalog, query, provider],
  );
  const selected = selectedId
    ? filtered.find((entry) => entry.command.id === selectedId)
    : filtered[0];
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (selected && selected.command.id !== selectedId) setSelectedId(selected.command.id);
  }, [selected, selectedId]);
  useLayoutEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.command.id, query, provider, ready]);
  const choose = async (id = selected?.command.id) => {
    if (!ready || choosing.current || !id) return;
    // Use the latest caller catalog, including its exclusions, at confirmation time.
    const command = commands.find((entry) => entry.id === id && !entry.hidden && !entry.missing);
    if (!command) return;
    choosing.current = true;
    setPending(true);
    setError('');
    try {
      await onChoose(command);
      if (live.current) onClose();
    } catch (cause) {
      if (live.current) setError(cause instanceof Error ? cause.message : t('common.saveFailed'));
    } finally {
      choosing.current = false;
      if (live.current) setPending(false);
    }
  };
  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void choose();
      return;
    }
    let next = selectedIndex;
    if (event.key === 'ArrowDown') next++;
    else if (event.key === 'ArrowUp') next--;
    else if (event.currentTarget === list.current && event.key === 'Home') next = 0;
    else if (event.currentTarget === list.current && event.key === 'End')
      next = filtered.length - 1;
    else return;
    event.preventDefault();
    const entry = filtered[Math.max(0, Math.min(filtered.length - 1, next))];
    if (entry) setSelectedId(entry.command.id);
  };
  const currentProvider = providers.find((entry) => entry.id === provider);
  return (
    <SettingsModal
      className="settings-group-dialog command-selection-dialog"
      bodyClassName="settings-dialog-body command-selection-body"
      labelledBy={`${prefix}-title`}
      onClose={onClose}
      onReady={setReady}
      busy={pending}
      closeDisabled={pending}
      error={error}
      header={
        <header>
          <h2 id={`${prefix}-title`}>{t('settings.commandSelection.title')}</h2>
          <button
            type="button"
            className="shortcut-dialog-close"
            disabled={pending}
            aria-label={t('common.closeDialog')}
            onClick={onClose}
          >
            ×
          </button>
        </header>
      }
      footer={
        <footer>
          <span className="command-selection-help">{t('settings.commandSelection.keys')}</span>
          <div>
            <button type="button" disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <SettingsButton
              className="primary"
              data-testid="command-selection-confirm"
              disabled={!ready || !selected}
              pending={pending}
              onClick={() => void choose()}
            >
              {t('settings.commandSelection.choose')}
            </SettingsButton>
          </div>
        </footer>
      }
    >
      <div className="command-selection-tools">
        <div className="command-shortcut-search">
          <span aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <SettingsInput
            ref={input}
            data-initial-focus
            type="search"
            role="combobox"
            aria-label={t('settings.commandSelection.search')}
            placeholder={t('settings.commandSelection.searchPlaceholder')}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${prefix}-results`}
            aria-activedescendant={selected ? `${prefix}-option-${selectedIndex}` : undefined}
            value={query}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(undefined);
            }}
            onKeyDown={navigate}
          />
        </div>
        <button
          type="button"
          className="text-button"
          disabled={!query && provider === 'all'}
          onClick={() => {
            setQuery('');
            setProvider('all');
            setSelectedId(undefined);
            input.current?.focus();
          }}
        >
          {t('settings.commandSelection.clear')}
        </button>
        <span aria-live="polite">
          <SettingsListCount visible={filtered.length} total={catalog.length} />
        </span>
      </div>
      <FilterSelect
        className="command-selection-provider-select"
        aria-label={t('settings.commandSelection.provider')}
        value={provider}
        onChange={(event) => {
          setProvider(event.target.value);
          setSelectedId(undefined);
        }}
      >
        {providers.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title} ({entry.count})
          </option>
        ))}
        {!currentProvider && (
          <option value={provider}>{t('settings.commandSelection.missingProvider')}</option>
        )}
      </FilterSelect>
      <div
        ref={browser}
        className="command-selection-browser"
        style={{ '--command-provider-width': `${visibleProviderWidth}px` } as CSSProperties}
      >
        <nav
          id={`${prefix}-providers`}
          className="command-selection-providers"
          aria-label={t('settings.commandSelection.provider')}
        >
          {providers.map((entry) => (
            <button
              type="button"
              key={entry.id}
              aria-pressed={provider === entry.id}
              onClick={() => {
                setProvider(entry.id);
                setSelectedId(undefined);
              }}
            >
              <span>{entry.title}</span>
              <small>{entry.count}</small>
            </button>
          ))}
        </nav>
        <div
          className="command-selection-resizer"
          role="separator"
          tabIndex={0}
          aria-label={t('settings.commandSelection.resizeProviders')}
          aria-controls={`${prefix}-providers`}
          aria-orientation="vertical"
          aria-valuemin={120}
          aria-valuemax={maximumProviderWidth}
          aria-valuenow={visibleProviderWidth}
          onDoubleClick={() => resizeProvider(170)}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            event.currentTarget.focus();
            drag.current = {
              x: event.clientX,
              width: visibleProviderWidth,
              pointer: event.pointerId,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer === event.pointerId)
              resizeProvider(drag.current.width + event.clientX - drag.current.x);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            const next = {
              ArrowLeft: visibleProviderWidth - 10,
              ArrowRight: visibleProviderWidth + 10,
              Home: 120,
              End: maximumProviderWidth,
            }[event.key];
            if (next !== undefined) {
              event.preventDefault();
              resizeProvider(next);
            }
          }}
        />
        <div
          ref={list}
          id={`${prefix}-results`}
          role="listbox"
          tabIndex={0}
          className="command-selection-results"
          aria-label={t('settings.commandSelection.results')}
          aria-activedescendant={selected ? `${prefix}-option-${selectedIndex}` : undefined}
          onKeyDown={navigate}
        >
          {filtered.map((entry, index) => (
            <div
              key={entry.command.id}
              id={`${prefix}-option-${index}`}
              role="option"
              aria-selected={entry === selected}
              className="command-selection-option"
              data-command-id={entry.command.id}
              onClick={() => setSelectedId(entry.command.id)}
              onDoubleClick={() => void choose(entry.command.id)}
            >
              <div>
                <span className="command-selection-name">{entry.command.title}</span>
                <small>{entry.providerTitle}</small>
              </div>
              <span className="command-selection-state">
                {entry.command.id === initialCommandId && (
                  <small>{t('settings.commandSelection.current')}</small>
                )}
                {!entry.command.available && (
                  <small>
                    {entry.command.disabledReason || t('commands.palette.startRequired')}
                  </small>
                )}
              </span>
            </div>
          ))}
          {!filtered.length && (
            <p className="command-selection-empty">{t('settings.commandSelection.empty')}</p>
          )}
        </div>
      </div>
      <section
        className="command-selection-detail"
        aria-label={t('settings.commandSelection.details')}
        aria-live="polite"
      >
        {selected ? (
          <>
            <strong>{selected.command.title}</strong>
            {selected.description && <p>{selected.description}</p>}
            <small>{t('settings.commandSelection.id', { id: selected.command.id })}</small>
          </>
        ) : (
          <p>
            {t(
              filtered.length
                ? 'settings.commandSelection.selectHint'
                : 'settings.commandSelection.emptyHint',
            )}
          </p>
        )}
      </section>
    </SettingsModal>
  );
}
