import { useLayoutEffect, useRef, useState } from 'react';
import type { LogScope, ShellPageRequest } from '../shared/shell-pages';

/** Reports layout only; page contents belong exclusively to the Shell. */
export function ShellPageSlot({
  scope,
  kind = 'logs',
  appletOrder = [],
  source = '',
  navigationRequest,
}: {
  scope?: LogScope;
  kind?: 'logs' | 'home' | 'notifications' | 'image-library';
  appletOrder?: string[];
  source?: string;
  navigationRequest: number;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const navigation = useRef(navigationRequest);
  navigation.current = navigationRequest;
  const request = useRef<ShellPageRequest>(
    kind === 'image-library'
      ? { id: crypto.randomUUID(), route: 'image-library', kind: 'image-library' }
      : kind === 'notifications'
        ? { id: crypto.randomUUID(), route: 'notifications', kind: 'notifications' }
        : kind === 'home'
          ? { id: crypto.randomUUID(), route: 'home', kind: 'home', appletOrder }
          : {
              id: crypto.randomUUID(),
              route: scope!.type === 'all' ? 'logs' : 'extensions',
              kind: 'logs',
              scope: scope!,
              source,
            },
  );
  if (request.current.kind === 'home') request.current.appletOrder = appletOrder;
  const [error, setError] = useState('');
  const refresh = useRef(() => {});
  useLayoutEffect(() => {
    const element = slot.current!;
    const main = element.closest('main')!;
    let live = true;
    let frame = 0;
    let lastReport = '';
    const update = () => {
      frame = 0;
      const r = element.getBoundingClientRect();
      let x = Math.max(0, r.left),
        y = Math.max(0, r.top),
        right = Math.min(window.innerWidth, r.right),
        bottom = Math.min(window.innerHeight, r.bottom);
      // Native child views must also respect the bounds of their embedded panel.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const p = parent.getBoundingClientRect();
        x = Math.max(x, p.left);
        y = Math.max(y, p.top);
        right = Math.min(right, p.right);
        bottom = Math.min(bottom, p.bottom);
        if (parent === main) break;
      }
      const bounds =
        element.getClientRects().length && right > x && bottom > y
          ? { x, y, width: right - x, height: bottom - y }
          : null;
      const report = JSON.stringify([request.current, bounds, navigation.current]);
      if (report === lastReport) return;
      lastReport = report;
      void window.dock.shellPage(request.current, bounds).catch((e) => {
        if (live) setError(String(e));
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    refresh.current = schedule;
    const unsubscribe = window.dock.onShellPageFocusHost((id, edge) => {
      if (id !== request.current.id) return;
      const elements = [
        ...document.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex="0"]',
        ),
      ].filter((e) => e !== element && e.getClientRects().length && !e.matches(':disabled'));
      const before = elements.filter(
        (e) => !!(e.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
      const after = elements.filter(
        (e) => !!(e.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
      );
      (edge === 'before' ? before.at(-1) : after[0])?.focus({ preventScroll: true });
    });
    update();
    const observer = new ResizeObserver(schedule);
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      observer.observe(parent);
      if (parent === main) break;
    }
    window.addEventListener('resize', schedule);
    // Capture scrolls in embedded panels as well as the main host area.
    main.addEventListener('scroll', schedule, true);
    return () => {
      live = false;
      refresh.current = () => {};
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('resize', schedule);
      main.removeEventListener('scroll', schedule, true);
      void window.dock.closeShellPage(request.current.id);
    };
  }, []);
  useLayoutEffect(() => refresh.current(), [navigationRequest, appletOrder]);
  return (
    <div
      ref={slot}
      className="shell-page-slot"
      tabIndex={0}
      aria-label={
        kind === 'image-library'
          ? '画像ライブラリーに移動'
          : kind === 'home'
            ? 'ホーム画面に移動'
            : kind === 'notifications'
              ? '通知センターに移動'
              : 'ログ画面に移動'
      }
      onFocus={(event) => {
        const from = event.relatedTarget;
        const before =
          from instanceof Node &&
          !!(from.compareDocumentPosition(event.currentTarget) & Node.DOCUMENT_POSITION_FOLLOWING);
        void window.dock.focusShellPage(request.current.id, before ? 'first' : 'last');
      }}
    >
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
