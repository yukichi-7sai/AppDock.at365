import { useLayoutEffect, useRef, useState } from 'react';
import type { RibbonGroupModel, OverlayAction, ShellOverlayApi } from '../../src/shared/overlays';
import { ribbonDisplayWidth } from '../../src/shared/ribbon';
import { RibbonIcon, ribbonLabel } from './RibbonButton';

export function RibbonGroupPanel({
  model,
  act,
  asset,
}: {
  model: RibbonGroupModel;
  act(action: OverlayAction): void;
  asset: ShellOverlayApi['asset'];
}) {
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { anchor, title, items, viewport, displayMode, parent } = model.content;
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const width = Math.max(
    1,
    Math.min(viewport?.width ?? ribbonDisplayWidth(displayMode), innerWidth),
  );
  const left = Math.max(0, Math.min(viewport?.x ?? anchor.x - 6, innerWidth - width));
  const minTop = Math.max(0, viewport?.y ?? 0);
  const bottom = Math.min(innerHeight, viewport ? viewport.y + viewport.height : innerHeight);
  const [position, setPosition] = useState<{
    direction: 'up' | 'down';
    top: number;
    maxHeight: number;
  }>();
  const close = () => act({ id: model.id, type: 'dismiss' });
  useLayoutEffect(() => {
    const update = () => {
      if (!panel.current || !content.current) return;
      const style = getComputedStyle(panel.current);
      const height =
        content.current.getBoundingClientRect().height +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom);
      const downTop = Math.max(minTop, anchor.y - 6);
      const upBottom = Math.min(bottom, anchor.y + anchor.height + 6);
      const below = Math.max(1, bottom - downTop);
      const above = Math.max(1, upBottom - minTop);
      const up = height > below + 0.5 && (height <= above + 0.5 || above > below);
      const maxHeight = up ? above : below;
      const top = up ? upBottom - Math.min(height, maxHeight) : downTop;
      const direction = up ? 'up' : 'down';
      setPosition((current) =>
        current &&
        current.direction === direction &&
        Math.abs(current.top - top) < 0.01 &&
        Math.abs(current.maxHeight - maxHeight) < 0.01
          ? current
          : { direction, top, maxHeight },
      );
    };
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    if (content.current) observer.observe(content.current);
    update();
    return () => observer.disconnect();
  }, [model.id, anchor.y, anchor.height, minTop, bottom, width, items]);
  useLayoutEffect(() => {
    if (!position) return;
    const buttons = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-ribbon-id]:not(:disabled)') ??
        []),
    ];
    if (list.current)
      list.current.scrollTop = position.direction === 'up' ? list.current.scrollHeight : 0;
    const nearest = position.direction === 'up' ? buttons.at(-1) : buttons[0];
    (
      nearest ??
      panel.current?.querySelector<HTMLButtonElement>('[data-ribbon-parent]') ??
      panel.current
    )?.focus({ preventScroll: true });
  }, [model.id, position?.direction]);
  const parentButton = (
    <button
      data-ribbon-parent={parent.id}
      style={{ height: anchor.height }}
      aria-label={ribbonLabel(parent)}
      title={ribbonLabel(parent)}
      aria-expanded="true"
      aria-controls={`temporary-${model.id}`}
      className={parent.selected ? 'active' : ''}
      onClick={close}
    >
      <RibbonIcon item={parent} asset={asset} />
      <span className="ribbon-disclosure" aria-hidden="true">
        −
      </span>
    </button>
  );
  return (
    <div
      className="ribbon-group-backdrop"
      onPointerDown={(e) => {
        setKeyboardFocus(false);
        if (e.target === e.currentTarget) close();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
        if (['Tab', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) setKeyboardFocus(true);
        const buttons = [
          ...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        if (e.key === 'Tab') {
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          e.preventDefault();
          buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}
    >
      <div
        ref={panel}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        className="ribbon-flyout ribbon-surface"
        data-keyboard-focus={keyboardFocus}
        data-direction={position?.direction}
        style={{
          left,
          top: position?.top ?? minTop,
          width,
          maxHeight: position?.maxHeight ?? Math.max(1, bottom - minTop),
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <div
          className="ribbon-flyout-list"
          ref={list}
          role="toolbar"
          aria-label={title}
          aria-orientation="vertical"
          onKeyDown={(e) => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            ];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? buttons.length - 1
                  : Math.max(
                      0,
                      Math.min(buttons.length - 1, index + (e.key === 'ArrowUp' ? -1 : 1)),
                    );
            e.preventDefault();
            buttons[next]?.focus();
          }}
        >
          <div
            className="ribbon-group"
            ref={content}
            data-expanded="true"
            data-expansion="temporary"
            style={
              {
                '--ribbon-group-color': parent.color || 'transparent',
                width: anchor.width,
                maxWidth: 'none',
              } as React.CSSProperties
            }
          >
            {position?.direction !== 'up' && parentButton}
            <div
              id={`temporary-${model.id}`}
              className="ribbon-children"
              role="group"
              aria-label={title}
            >
              {items.map((item) =>
                item.kind === 'separator' ? (
                  <div
                    key={item.id}
                    className="ribbon-separator"
                    role="separator"
                    aria-orientation="horizontal"
                  />
                ) : (
                  <button
                    key={item.id}
                    data-ribbon-id={item.id}
                    disabled={!item.enabled}
                    className={item.selected ? 'active' : ''}
                    aria-label={ribbonLabel(item)}
                    title={item.disabledReason || ribbonLabel(item)}
                    aria-current={item.selected ? 'page' : undefined}
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    }
                    onClick={() =>
                      act({
                        id: model.id,
                        type: 'ribbonChoose',
                        actionId: item.actionId!,
                        requestId: crypto.randomUUID(),
                      })
                    }
                  >
                    <RibbonIcon item={item} asset={asset} />
                  </button>
                ),
              )}
            </div>
            {position?.direction === 'up' && parentButton}
          </div>
        </div>
      </div>
    </div>
  );
}
