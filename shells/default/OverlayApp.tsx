import { useEffect, useRef, useState } from 'react';
import type { OverlayAction, OverlayModel, ShellOverlayApi } from '../../src/shared/overlays';
import { CommandPalette } from './CommandPalette';
import { RibbonGroupPanel } from './RibbonGroupPanel';
declare global {
  interface Window {
    appdockOverlay: ShellOverlayApi;
  }
}
const api = window.appdockOverlay;
export function OverlayApp() {
  const [binding, setBinding] = useState<{ model: OverlayModel; session: string }>();
  const model = binding?.model;
  const activeModelId = useRef<string | undefined>(undefined);
  activeModelId.current = model?.id;
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let currentId = '';
    let sequence = 0;
    const connect = async () => {
      const request = ++sequence;
      try {
        const c = await api.connect();
        if (!live || request !== sequence) return;
        currentId = c.snapshot.id;
        setError('');
        setBinding({ model: c.snapshot, session: c.sessionId });
      } catch (e) {
        if (live && request === sequence) setError(String(e));
      }
    };
    const accept = (next: OverlayModel) => {
      if (!live) return;
      if (next.id !== currentId) {
        void connect();
        return;
      }
      setBinding((old) =>
        old && old.model.id === next.id && old.model.revision > next.revision
          ? old
          : old && { ...old, model: next },
      );
    };
    const unsubscribe = api.onChanged(accept);
    const unsuspend = api.onSuspended?.(() => {
      sequence++;
      currentId = '';
      setBinding(undefined);
      setError('');
    });
    void connect();
    return () => {
      live = false;
      unsubscribe();
      unsuspend?.();
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (binding)
      void api.ready(binding.session, { reusable: true, modelId: binding.model.id }).catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [binding?.session, model?.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = model?.dark ? 'dark' : 'light';
  }, [model?.dark]);
  const act = (action: OverlayAction) => {
    setError('');
    void api.act(action).catch((e) => {
      if (activeModelId.current === action.id) setError(String(e));
    });
  };
  if (!model) return null;
  if (model.kind === 'ribbon-group')
    return <RibbonGroupPanel model={model} act={act} asset={api.asset} />;
  const content = model.content;
  return (
    <CommandPalette
      key={model.id}
      commands={content.commands}
      pins={content.pins}
      shortcuts={content.shortcuts}
      mode={content.mode}
      busy={content.busy}
      error={error || content.error}
      onChoose={(c) => act({ id: model.id, type: 'choose', commandId: c.id })}
      onClose={() => act({ id: model.id, type: 'dismiss' })}
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
  );
}
