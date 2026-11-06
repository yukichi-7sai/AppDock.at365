import { useHostTranslation } from '../HostTranslation';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSettingsHints } from './SettingsHints';
import { parseDescriptionText } from '../../shared/description-text';
import { DescriptionText } from './DescriptionText';
import { useOptionalSettingsControls } from './api';
import { openHintPopover } from './hint-popover';
import './settings-hint-icon.css';

type TextMode = 'links' | 'plain' | 'literal';

/** Optional title guidance shares the same preference as inline settings hints. */
export function SettingsHintIcon({ title, hint }: { title: string; hint?: string }) {
  const visible = useSettingsHints();
  return visible && hint?.trim() ? <HintPopover title={title} hint={hint} /> : null;
}

/** Command explanations remain available independently of optional settings hints. */
export function SettingsDescriptionIcon({
  title,
  description,
  testId,
  textMode,
}: {
  title: string;
  description?: string;
  testId?: string;
  textMode?: TextMode;
}) {
  return description?.trim() ? (
    <HintPopover title={title} hint={description} description testId={testId} textMode={textMode} />
  ) : null;
}

/** MCP restrictions remain visible even when optional hints are hidden. */
export function SettingsLockIcon({ title, description }: { title: string; description: string }) {
  return <HintPopover title={title} hint={description} description lock textMode="literal" />;
}

/** Long explanations open on request and stay available while their text is read. */
export function SettingsDescriptionButton({
  title,
  description,
  label,
  textMode,
}: {
  title: string;
  description: string;
  label: string;
  textMode?: TextMode;
}) {
  return (
    <HintPopover
      title={title}
      hint={description}
      description
      buttonLabel={label}
      textMode={textMode}
    />
  );
}

function HintPopover({
  title,
  hint,
  description = false,
  testId,
  lock = false,
  buttonLabel,
  textMode = 'links',
}: {
  title: string;
  hint: string;
  description?: boolean;
  testId?: string;
  lock?: boolean;
  buttonLabel?: string;
  textMode?: TextMode;
}) {
  const { t } = useHostTranslation();
  const controls = useOptionalSettingsControls();
  const hasReferences = useMemo(
    () =>
      textMode !== 'literal' && parseDescriptionText(hint).some((token) => token.kind !== 'text'),
    [hint, textMode],
  );
  const interactive = textMode === 'links' && hasReferences && !!controls;
  const region = !!buttonLabel || interactive;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const suppressFocus = useRef(false);
  const visited = useRef(false);
  const [open, setOpen] = useState(false);
  const show = () => {
    window.clearTimeout(closeTimer.current);
    visited.current = true;
    setOpen(true);
  };
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (
        document.activeElement !== trigger.current &&
        !popup.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 100);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    const tooltip = popup.current;
    const button = trigger.current;
    if (!open || !tooltip || !button) return;
    return openHintPopover(
      button,
      tooltip,
      () => setOpen(false),
      () => {
        suppressFocus.current = true;
        button.focus({ preventScroll: true });
        suppressFocus.current = false;
      },
    );
  }, [open, hint, buttonLabel]);
  return (
    <span
      className={description ? 'settings-description-icon' : 'settings-hint-icon'}
      onPointerEnter={buttonLabel ? undefined : show}
      onPointerLeave={buttonLabel ? undefined : leave}
      onBlur={
        buttonLabel
          ? undefined
          : (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
            }
      }
    >
      <button
        ref={trigger}
        type="button"
        className={
          buttonLabel
            ? 'settings-description-button'
            : description
              ? 'settings-description-trigger'
              : 'settings-hint-trigger'
        }
        data-testid={testId}
        aria-label={t(
          lock ? 'settings.mcpAccess.label' : description ? 'common.description' : 'common.hint',
          { title },
        )}
        aria-describedby={buttonLabel ? undefined : interactive ? `${id}-text` : id}
        aria-expanded={region ? open : undefined}
        aria-controls={region ? id : undefined}
        onFocus={
          buttonLabel
            ? undefined
            : () => {
                if (!suppressFocus.current) show();
              }
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          show();
        }}
      >
        {buttonLabel ?? (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {!lock && <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />}
            {lock ? (
              <>
                <rect
                  x="4.5"
                  y="8.5"
                  width="11"
                  height="8"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="10" cy="12.5" r="1" fill="currentColor" />
              </>
            ) : description ? (
              <>
                <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="10" cy="6" r=".9" fill="currentColor" />
              </>
            ) : (
              <>
                <path
                  d="M7.8 7.5a2.2 2.2 0 0 1 4.4 0c0 1.6-2.2 1.8-2.2 3.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="14" r=".9" fill="currentColor" />
              </>
            )}
          </svg>
        )}
      </button>
      {interactive && (
        <span id={`${id}-text`} className="sr-only">
          <DescriptionText text={hint} interactive={false} />
        </span>
      )}
      <span
        ref={popup}
        id={id}
        className={`settings-hint-tooltip${buttonLabel ? ' settings-description-popover' : ''}`}
        role={region ? 'region' : 'tooltip'}
        aria-label={region ? title : undefined}
        popover="manual"
        onPointerEnter={buttonLabel ? undefined : show}
        onPointerLeave={buttonLabel ? undefined : leave}
      >
        {buttonLabel && (
          <button
            type="button"
            className="settings-description-close"
            aria-label={t('common.closeDialog')}
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            ×
          </button>
        )}
        {textMode === 'literal' ? (
          hint
        ) : (
          <DescriptionText
            text={hint}
            interactive={interactive && visited.current}
            focusFallback={() => trigger.current}
          />
        )}
      </span>
    </span>
  );
}
