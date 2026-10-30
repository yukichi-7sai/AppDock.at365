import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type {
  CommandPaletteModel,
  CommandPaletteViewApi,
  OverlayAction,
} from '../../shared/overlays';
import { HostTranslationProvider } from '../HostTranslation';
import { CommandPalette } from './CommandPalette';
import '../theme.css';
import './surface.css';
import './palette.css';
declare global {
  interface Window {
    appdockPalette: CommandPaletteViewApi;
  }
}
const api = window.appdockPalette;
function PaletteApp() {
  const [binding, setBinding] = useState<{ model: CommandPaletteModel; session: string }>();
  const [error, setError] = useState('');
  const current = useRef<string | undefined>(undefined);
  current.current = binding?.model.id;
  useEffect(() => {
    let live = true,
      id = '',
      sequence = 0;
    const connect = async () => {
      const request = ++sequence;
      try {
        const next = await api.connect();
        if (!live || request !== sequence) return;
        id = next.snapshot.id;
        setError('');
        setBinding({ model: next.snapshot, session: next.sessionId });
      } catch (reason) {
        if (live && request === sequence) setError(String(reason));
      }
    };
    const unsubscribe = api.onChanged((next) => {
      if (!live) return;
      if (next.id !== id) {
        void connect();
        return;
      }
      setBinding((previous) =>
        previous && previous.model.revision <= next.revision
          ? { ...previous, model: next }
          : previous,
      );
    });
    const unsuspend = api.onSuspended(() => {
      sequence++;
      id = '';
      setBinding(undefined);
      setError('');
    });
    void connect();
    return () => {
      live = false;
      unsubscribe();
      unsuspend();
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (binding)
      void api.ready(binding.session, binding.model.id).catch((reason) => {
        if (live) setError(String(reason));
      });
    return () => {
      live = false;
    };
  }, [binding?.session, binding?.model.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = binding?.model.dark ? 'dark' : 'light';
  }, [binding?.model.dark]);
  if (!binding) return null;
  const model = binding.model,
    content = model.content;
  const act = (action: Exclude<OverlayAction, { type: 'ribbonChoose' }>) => {
    setError('');
    void api.act(action).catch((reason) => {
      if (current.current === action.id) setError(String(reason));
    });
  };
  return (
    <HostTranslationProvider language={model.language}>
      <CommandPalette
        key={model.id}
        commands={content.commands}
        pins={content.pins}
        shortcuts={content.shortcuts}
        triggers={content.triggers}
        mode={content.mode}
        initialCommandId={content.initialCommandId}
        busy={content.busy}
        error={error || content.error}
        onChoose={(command) => act({ id: model.id, type: 'choose', commandId: command.id })}
        onClose={() => act({ id: model.id, type: 'dismiss' })}
        onOpenTriggerSettings={
          content.mode === 'execute'
            ? (command) => act({ id: model.id, type: 'openTriggerSettings', commandId: command.id })
            : undefined
        }
        onPinAction={
          content.mode === 'execute'
            ? (type, commandId, direction, visibleIds) =>
                act(
                  type === 'togglePin'
                    ? { id: model.id, type, commandId }
                    : {
                        id: model.id,
                        type,
                        commandId,
                        direction: direction!,
                        visibleIds: visibleIds!,
                      },
                )
            : undefined
        }
      />
    </HostTranslationProvider>
  );
}
createRoot(document.getElementById('root')!).render(<PaletteApp />);
