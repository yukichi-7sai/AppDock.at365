import { useLayoutEffect, useRef } from 'react';
import { settingsPopoverScroll } from '../settings-ui/settings-popover-scroll';

export interface LibraryMenuItem {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  run(): void;
}
export function ImageLibraryMenu({
  title,
  opener,
  point,
  items,
  close,
}: {
  title: string;
  opener: HTMLElement;
  point?: { x: number; y: number };
  items: LibraryMenuItem[];
  close(): void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    const menu = popup.current!;
    menu.showPopover();
    const rect = opener.getBoundingClientRect(),
      size = menu.getBoundingClientRect();
    const x = point?.x ?? rect.left,
      y = point?.y ?? rect.bottom + 4;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - size.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - size.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const dismiss = () => closeRef.current();
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node) && !opener.contains(e.target as Node)) dismiss();
    };
    const scroll = settingsPopoverScroll(opener, menu, dismiss);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      if (menu.isConnected && menu.matches(':popover-open')) menu.hidePopover();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [opener, point]);
  return (
    <div
      ref={popup}
      popover="manual"
      role="menu"
      aria-label={title}
      className="library-menu"
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
          opener.focus({ preventScroll: true });
          return;
        }
        if (e.key === 'Tab') {
          close();
          opener.focus({ preventScroll: true });
          return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const buttons = [
          ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const index =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : e.key === 'ArrowDown'
                ? (current + 1) % buttons.length
                : e.key === 'ArrowUp'
                  ? (current + buttons.length - 1) % buttons.length
                  : -1;
        if (index >= 0) {
          e.preventDefault();
          buttons[index]?.focus();
        }
      }}
    >
      <div className="library-menu-title">{title}</div>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          data-danger={item.danger}
          data-separator={item.separator}
          onClick={() => {
            close();
            opener.focus({ preventScroll: true });
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
