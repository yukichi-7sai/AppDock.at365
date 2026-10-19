import { useLayoutEffect, useRef } from 'react';
import type { ShellBarRegion } from '../shared/shell-bars';

/** Only reserves space and transfers focus; all bar rendering belongs to the selected Shell. */
export function ShellBarSlot({ region }: { region: ShellBarRegion }) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = slot.current!;
    let last = '';
    const update = () => {
      const r = element.getBoundingClientRect();
      const bounds = { x: r.x, y: r.y, width: r.width, height: r.height };
      const signature = JSON.stringify(bounds);
      if (signature === last) return;
      last = signature;
      void window.dock.barViewport(region, bounds);
    };
    const unsubscribe = window.dock.onBarFocusHost((source, edge) => {
      if (source !== region) return;
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex="0"]',
        ),
      ].filter((e) => e !== element && e.getClientRects().length && !e.matches(':disabled'));
      const adjacent = controls.filter(
        (e) =>
          !!(
            e.compareDocumentPosition(element) &
            (edge === 'before'
              ? Node.DOCUMENT_POSITION_FOLLOWING
              : Node.DOCUMENT_POSITION_PRECEDING)
          ),
      );
      const target =
        edge === 'before' ? (adjacent.at(-1) ?? controls.at(-1)) : (adjacent[0] ?? controls[0]);
      target?.focus({ preventScroll: true });
    });
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    observer.observe(element);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('resize', update);
      void window.dock.barViewport(region, null);
    };
  }, [region]);
  return (
    <div
      ref={slot}
      className="shell-bar-slot"
      data-region={region}
      tabIndex={0}
      aria-label={region === 'titlebar' ? 'タイトルバーに移動' : 'ステータスバーに移動'}
      onFocus={(event) => {
        const from = event.relatedTarget;
        const before =
          from instanceof Node &&
          !!(from.compareDocumentPosition(event.currentTarget) & Node.DOCUMENT_POSITION_FOLLOWING);
        void window.dock.focusBar(region, before ? 'first' : 'last');
      }}
    />
  );
}
