import { useEffect, useState } from 'react';
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
  const [model, setModel] = useState<OverlayModel>();
  const [session, setSession] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const accept = (next: OverlayModel) => {
      if (live)
        setModel((old) => (old && old.id === next.id && old.revision > next.revision ? old : next));
    };
    const unsubscribe = api.onChanged(accept);
    void api
      .connect()
      .then((c) => {
        if (live) {
          accept(c.snapshot);
          setSession(c.sessionId);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (session && model) void api.ready(session).catch((e) => setError(String(e)));
  }, [session, !!model]);
  useEffect(() => {
    document.documentElement.dataset.theme = model?.dark ? 'dark' : 'light';
  }, [model?.dark]);
  const act = (action: OverlayAction) => {
    setError('');
    void api.act(action).catch((e) => setError(String(e)));
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
