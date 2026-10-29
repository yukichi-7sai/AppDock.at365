import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CommandReference } from '../../shared/command-text';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import { useOptionalSettingsControls } from './api';
import { useSettingsFeedback } from './SettingsStatus';
import './command-link.css';

const References = createContext<ReadonlyMap<string, CommandReference>>(new Map());
export function CommandReferencesProvider({
  references = [],
  children,
}: {
  references?: CommandReference[];
  children: ReactNode;
}) {
  const index = useMemo(() => new Map(references.map((value) => [value.id, value])), [references]);
  return <References.Provider value={index}>{children}</References.Provider>;
}
export function useCommandReferences() {
  return useContext(References);
}
export function CommandLink({ commandId }: { commandId: string }) {
  const { t } = useHostTranslation();
  const command = useCommandReferences().get(commandId);
  const controls = useOptionalSettingsControls();
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const button = useRef<HTMLButtonElement>(null);
  const request = useRef<string | undefined>(undefined);
  const restoreFocus = useRef(false);
  const live = useRef(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (!busy && restoreFocus.current) {
      restoreFocus.current = false;
      // Wait for React to re-enable the button; the host restores native focus.
      if (button.current?.isConnected) button.current.focus({ preventScroll: true });
    }
  }, [busy]);
  useSettingsFeedback({ error, target: command?.title ?? commandId });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (request.current)
        void controlsRef.current?.cancelCommandPalette(request.current).catch(() => {});
      request.current = undefined;
    };
  }, [commandId]);
  if (!command)
    return (
      <span className="command-reference-missing">
        {t('commands.link.unknown', { id: commandId })}
      </span>
    );
  if (!controls) return <span>{command.title}</span>;
  const label = t('commands.link.open', { title: command.title });
  return (
    <button
      ref={button}
      type="button"
      className="command-link"
      title={label}
      aria-label={label}
      disabled={busy}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (request.current) return;
        const id = crypto.randomUUID();
        let restore = true;
        request.current = id;
        setBusy(true);
        setError('');
        void controls
          .openCommandPalette({ requestId: id, mode: 'execute', initialCommandId: commandId })
          .then((result) => {
            restore = result.status !== 'cancelled' || result.reason === 'dismissed';
          })
          .catch((reason) => {
            if (live.current && request.current === id) setError(String(reason));
          })
          .finally(() => {
            if (request.current !== id) return;
            request.current = undefined;
            if (!live.current) return;
            restoreFocus.current = restore;
            setBusy(false);
          });
      }}
    >
      <Icon name="command" size={14} />
      <span>{command.title}</span>
    </button>
  );
}
