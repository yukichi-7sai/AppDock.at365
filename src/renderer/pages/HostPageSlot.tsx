import { useEffect, useRef, useState } from 'react';
import type { HostPageModel, HostPageRequest, LogScope } from '../../shared/host-pages';
import { HomePage } from './HomePage';
import { LogPage } from './LogPage';
import { ImageLibraryPage } from './ImageLibraryPage';
import { NotificationCenterPage } from './NotificationCenterPage';

/** Pages share the host DOM, keyboard routing, theme and native dialog stack. */
export function HostPageSlot({
  kind = 'logs',
  scope = { type: 'all' },
  source = '',
  appletOrder = [],
  navigationRequest,
}: {
  kind?: HostPageRequest['kind'];
  scope?: LogScope;
  source?: string;
  appletOrder?: string[];
  navigationRequest: number;
}) {
  const id = useRef(crypto.randomUUID());
  const [model, setModel] = useState<HostPageModel>();
  const [error, setError] = useState('');
  const current = useRef<HostPageModel | undefined>(undefined);
  const request: HostPageRequest =
    kind === 'logs'
      ? { id: id.current, kind, route: scope.type === 'all' ? 'logs' : 'extensions', scope, source }
      : kind === 'home'
        ? { id: id.current, kind, route: kind, appletOrder }
        : kind === 'image-library'
          ? { id: id.current, kind, route: 'image-library' }
          : { id: id.current, kind, route: 'notifications' };
  const signature = JSON.stringify(request);
  const accept = (next: HostPageModel | null) => {
    if (!next || next.id !== id.current) return;
    if (current.current && next.revision < current.current.revision) return;
    current.current = next;
    setModel(next);
  };
  useEffect(() => {
    const off = window.dock.pages.onChanged(accept);
    return () => {
      off();
      void window.dock.pages.close(id.current).catch(() => {});
    };
  }, []);
  useEffect(() => {
    let live = true;
    void window.dock.pages
      .open(JSON.parse(signature) as HostPageRequest)
      .then((next) => {
        if (live) {
          accept(next);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [signature, navigationRequest]);
  return (
    <div className="host-page-slot" data-page={kind}>
      {error && <p role="alert">{error}</p>}
      {model?.kind === 'home' && <HomePage initialModel={model} />}
      {model?.kind === 'logs' && <LogPage initialModel={model} />}
      {model?.kind === 'image-library' && <ImageLibraryPage initialModel={model} />}
      {model?.kind === 'notifications' && <NotificationCenterPage initialModel={model} />}
    </div>
  );
}
