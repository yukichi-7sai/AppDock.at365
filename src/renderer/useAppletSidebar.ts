import { useRef, useState } from 'react';
import { useHostTranslation } from './HostTranslation';
import type { KeyboardEvent, PointerEvent } from 'react';

const storageKey = 'appdock.applet-sidebar-width';
const minimum = 220;
const maximum = 480;
const defaultWidth = 280;
const clamp = (value: number) => Math.round(Math.max(minimum, Math.min(maximum, value)));

export function useAppletSidebar() {
  const { t } = useHostTranslation();
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return Number.isFinite(saved) && saved >= minimum && saved <= maximum ? saved : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (next: number) => {
    const value = clamp(next);
    setWidth(value);
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      // Resizing remains available when Chromium storage is unavailable.
    }
  };
  return {
    width,
    resize,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': t('workspace.resizeAppletSidebar'),
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': minimum,
      'aria-valuemax': maximum,
      'aria-valuenow': width,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          x: event.clientX,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onLostPointerCapture() {
        drag.current = null;
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const next = {
          ArrowLeft: width - 10,
          ArrowRight: width + 10,
          Home: minimum,
          End: maximum,
        }[event.key];
        if (next !== undefined) {
          event.preventDefault();
          resize(next);
        }
      },
    },
  };
}
