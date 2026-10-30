import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rankCommands, type UiCommand } from '../../shared/commands';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import { CommandTriggerMark } from '../settings-ui/CommandTriggerMark';
import type { CommandTriggerMark as TriggerMark } from '../../shared/command-triggers';

/** Execution and selection share navigation and favorites; only the caller decides the action. */
export function CommandPalette({
  commands,
  pins = [],
  onPinAction,
  shortcuts = {},
  triggers,
  onOpenTriggerSettings,
  busy = false,
  mode = 'execute',
  onChoose,
  onClose,
  error = '',
  initialCommandId,
}: {
  commands: UiCommand[];
  pins?: string[];
  onPinAction?(
    type: 'togglePin' | 'movePin',
    commandId: string,
    direction?: -1 | 1,
    visibleIds?: string[],
  ): void;
  shortcuts?: Record<string, string[]>;
  triggers?: Record<string, TriggerMark[]>;
  onOpenTriggerSettings?(command: UiCommand): void;
  busy?: boolean;
  mode?: 'execute' | 'select';
  onChoose(command: UiCommand): void;
  onClose(): void;
  error?: string;
  initialCommandId?: string;
}) {
  const { t } = useHostTranslation();
  const [query, setQuery] = useState(() => initialCommandId ?? ''),
    [selectedId, setSelectedId] = useState<string | undefined>(
      () =>
        initialCommandId ??
        rankCommands(
          commands.filter((c) => !c.hidden),
          pins,
        )[0]?.id,
    );
  const ref = useRef<HTMLDivElement>(null),
    prefix = useId();
  const filtered = rankCommands(
    commands.filter(
      (c) =>
        !c.hidden &&
        `${c.title} ${c.description ?? ''} ${c.extension} ${c.id}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    pins,
  );
  const selected =
    selectedId === undefined
      ? filtered.length
        ? 0
        : -1
      : filtered.findIndex((c) => c.id === selectedId);
  const visiblePins = filtered.filter((c) => pins.includes(c.id)).map((c) => c.id);
  const canChoose = (c: UiCommand) => !busy && (mode === 'select' || c.available);
  useLayoutEffect(() => {
    const input = ref.current?.querySelector('input');
    input?.focus();
    if (initialCommandId) input?.select();
  }, [mode, initialCommandId]);
  useLayoutEffect(() => {
    const reveal = () =>
      ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    reveal();
    // Native surface bounds arrive after ready and may change with the host window.
    const observer = new ResizeObserver(reveal);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [selected, query]);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t(mode === 'select' ? 'commands.palette.select' : 'commands.palette.title')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Tab') {
            const nodes = Array.from(
              ref.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [],
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="palette-input">
          <Icon name="search" />
          <input
            aria-label={t('commands.palette.search')}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={`${prefix}-results`}
            aria-activedescendant={filtered[selected] ? `${prefix}-option-${selected}` : undefined}
            placeholder={t(
              mode === 'select'
                ? 'commands.palette.selectPlaceholder'
                : 'commands.palette.executePlaceholder',
            )}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId(undefined);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next =
                  selected < 0
                    ? e.key === 'ArrowDown'
                      ? 0
                      : filtered.length - 1
                    : (selected + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) %
                      filtered.length;
                setSelectedId(filtered[next]?.id);
              }
              if (
                e.key === 'Enter' &&
                !e.repeat &&
                filtered[selected] &&
                canChoose(filtered[selected])
              ) {
                e.preventDefault();
                onChoose(filtered[selected]);
              }
            }}
          />
          <button aria-label={t('commands.palette.close')} onClick={onClose}>
            <kbd>Esc</kbd>
          </button>
        </div>
        <div className="palette-label">
          {t(mode === 'select' ? 'commands.palette.select' : 'commands.palette.label')}
        </div>
        <div
          id={`${prefix}-results`}
          className="palette-results"
          role="listbox"
          aria-label={t('commands.palette.results')}
        >
          {filtered.map((c, i) => {
            const pinned = pins.includes(c.id),
              pinIndex = visiblePins.indexOf(c.id);
            const marks =
              triggers?.[c.id] ??
              (triggers
                ? []
                : (shortcuts[c.id] ?? []).map((input, index) => ({
                    id: String(index),
                    kind: 'shortcuts' as const,
                    input,
                  })));
            return (
              <div
                className={`palette-command ${pinned ? 'pinned' : ''} ${i === selected ? 'highlighted' : ''}`}
                id={`${prefix}-option-${i}`}
                role="option"
                aria-selected={i === selected}
                key={c.id}
                data-command-id={c.id}
              >
                <button
                  className="palette-execute"
                  disabled={!canChoose(c)}
                  onClick={() => onChoose(c)}
                >
                  <div className="palette-command-text">
                    {c.title}
                    {c.description && <small>{c.description}</small>}
                    <small title={c.extension}>
                      <span className="command-id">{c.id}</span>
                      {!c.available && (
                        <span> · {c.disabledReason ?? t('commands.palette.startRequired')}</span>
                      )}
                      {pinned && <span className="pin-badge">{t('commands.palette.pinned')}</span>}
                    </small>
                  </div>
                  {!!marks.length && (
                    <span className="palette-triggers">
                      {marks.map((mark) => (
                        <CommandTriggerMark key={mark.id} kind={mark.kind} input={mark.input} />
                      ))}
                    </span>
                  )}
                </button>
                {onOpenTriggerSettings && (
                  <button
                    className="palette-trigger-settings"
                    disabled={busy}
                    title={t('settings.commandTriggers.title')}
                    aria-label={t('settings.commandSettingsNavigation.open', {
                      title: c.title,
                      title2: t('settings.commandTriggers.title'),
                    })}
                    onClick={() => onOpenTriggerSettings(c)}
                  >
                    <Icon name="bolt" size={16} />
                  </button>
                )}
                {onPinAction && (
                  <div className="palette-pin-controls">
                    <button
                      className="pin-toggle"
                      aria-label={t(pinned ? 'commands.palette.unpin' : 'commands.palette.pin', {
                        title: c.title,
                      })}
                      aria-pressed={pinned}
                      disabled={busy}
                      onClick={() => onPinAction('togglePin', c.id)}
                    >
                      {pinned ? '★' : '☆'}
                    </button>
                    {pinned && (
                      <div className="palette-pin-order">
                        <button
                          aria-label={t('commands.palette.moveUp', { title: c.title })}
                          title={t('commands.palette.moveUp', { title: c.title })}
                          disabled={busy || pinIndex <= 0}
                          onClick={() => onPinAction('movePin', c.id, -1, visiblePins)}
                        >
                          △
                        </button>
                        <button
                          aria-label={t('commands.palette.moveDown', { title: c.title })}
                          title={t('commands.palette.moveDown', { title: c.title })}
                          disabled={busy || pinIndex === visiblePins.length - 1}
                          onClick={() => onPinAction('movePin', c.id, 1, visiblePins)}
                        >
                          ▽
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!filtered.length && <p className="empty">{t('commands.palette.empty')}</p>}
        </div>
        {error && <p role="alert">{error}</p>}
        {!error &&
          initialCommandId &&
          initialCommandId === selectedId &&
          !commands.some((c) => !c.hidden && c.id === initialCommandId) && (
            <p role="alert">{t('commands.link.missing')}</p>
          )}
        <div className="palette-footer">
          {t(mode === 'select' ? 'commands.palette.selectHint' : 'commands.palette.executeHint')}
          {onPinAction && t('commands.palette.pinHint')}
        </div>
      </div>
    </div>,
    document.body,
  );
}
