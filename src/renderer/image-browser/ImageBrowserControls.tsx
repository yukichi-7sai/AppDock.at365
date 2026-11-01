import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
  type KeyboardEvent,
  type ToggleEvent,
} from 'react';
import type { ImageLibraryLayout } from '../../shared/image-library-page';
import { Icon } from '../../shared/ui-icons';
import { useLibraryTranslation } from './LibraryMedia';

export function useImageBrowserNavigation(
  root: RefObject<HTMLElement | null>,
  sidebar: RefObject<HTMLElement | null>,
  button: RefObject<HTMLButtonElement | null>,
  onResize?: () => void,
) {
  const [narrow, setNarrow] = useState(false),
    [drawer, setDrawer] = useState(false);
  const resize = useRef(onResize);
  resize.current = onResize;
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setNarrow(root.current!.clientWidth < 680);
      resize.current?.();
    });
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const pane = sidebar.current!;
    if (narrow && drawer) {
      pane.showPopover();
      const bounds = root.current!.getBoundingClientRect();
      pane.style.left = bounds.left + 'px';
      pane.style.top = bounds.top + 'px';
      pane.style.height = bounds.height + 'px';
      pane.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    } else {
      if (pane.matches(':popover-open')) pane.hidePopover();
      if (!narrow) {
        pane.style.left = '';
        pane.style.top = '';
        pane.style.height = '';
      }
    }
  }, [narrow, drawer]);
  const close = () => {
    setDrawer(false);
    if (narrow) button.current?.focus({ preventScroll: true });
  };
  return {
    narrow,
    drawer,
    setDrawer,
    close,
    sidebarProps: {
      popover: narrow ? ('auto' as const) : undefined,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (
          narrow &&
          e.key === 'Escape' &&
          !e.nativeEvent.isComposing &&
          e.nativeEvent.keyCode !== 229
        ) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      },
      onToggle: (e: ToggleEvent<HTMLElement>) => {
        if (e.newState === 'closed') setDrawer(false);
      },
    },
  };
}

export function ImageBrowserSplitter({
  layout,
  sidebar,
  narrow,
  dragging,
  onChange,
  onCommit,
}: {
  layout: RefObject<ImageLibraryLayout>;
  sidebar: RefObject<HTMLElement | null>;
  narrow: boolean;
  dragging: RefObject<boolean>;
  onChange(value: ImageLibraryLayout): void;
  onCommit(value: ImageLibraryLayout): void;
}) {
  const { t } = useLibraryTranslation();
  const cancel = (element: HTMLElement) => {
    dragging.current = false;
    onChange({ ...layout.current, sidebarWidth: Number(element.dataset.original) || 220 });
  };
  return (
    <div
      className="library-splitter"
      role="separator"
      tabIndex={narrow ? -1 : 0}
      aria-orientation="vertical"
      aria-label={t('images.sidebarWidth')}
      aria-valuemin={160}
      aria-valuemax={480}
      aria-valuenow={layout.current.sidebarWidth}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        e.currentTarget.dataset.original = String(layout.current.sidebarWidth);
      }}
      onPointerMove={(e) => {
        if (!dragging.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onChange({
          ...layout.current,
          sidebarWidth: Math.max(
            160,
            Math.min(480, Math.round(e.clientX - sidebar.current!.getBoundingClientRect().left)),
          ),
        });
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(layout.current);
      }}
      onPointerCancel={(e) => cancel(e.currentTarget)}
      onLostPointerCapture={(e) => {
        if (dragging.current) cancel(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (
          e.nativeEvent.isComposing ||
          e.nativeEvent.keyCode === 229 ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        const values: Record<string, number> = {
          ArrowLeft: layout.current.sidebarWidth - 8,
          ArrowRight: layout.current.sidebarWidth + 8,
          Home: 160,
          End: 480,
        };
        if (values[e.key] !== undefined) {
          e.preventDefault();
          onCommit({
            ...layout.current,
            sidebarWidth: Math.max(160, Math.min(480, values[e.key])),
          });
        }
      }}
    />
  );
}

export function ImageBrowserFilters({
  folder,
  onFolder,
  query,
  onQuery,
  onSearch,
  disabled,
  navigation,
  navigationButton,
  size,
  locationActions,
  children,
}: {
  folder: string;
  onFolder(value: string): void;
  query: string;
  onQuery(value: string): void;
  onSearch(value: string): void;
  disabled?: boolean;
  navigation: Pick<ReturnType<typeof useImageBrowserNavigation>, 'narrow' | 'drawer' | 'setDrawer'>;
  navigationButton: RefObject<HTMLButtonElement | null>;
  size: ReactNode;
  locationActions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useLibraryTranslation();
  return (
    <>
      <div className="library-location">
        {navigation.narrow && (
          <button
            type="button"
            className="library-navigation-button"
            ref={navigationButton}
            aria-expanded={navigation.drawer}
            aria-haspopup="true"
            onClick={() => navigation.setDrawer(!navigation.drawer)}
          >
            {t('images.navigation')}
          </button>
        )}
        <nav className="library-breadcrumb" aria-label={t('images.location')}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFolder(folder === '*' ? '*' : '')}
          >
            {t(folder === '*' ? 'images.allFolders' : 'images.rootFolder')}
          </button>
          {folder !== '*' &&
            folder
              .split('/')
              .filter(Boolean)
              .map((part, i, parts) => (
                <span key={i}>
                  <Icon name="chevron" size={12} />
                  <button
                    type="button"
                    disabled={disabled}
                    title={parts.slice(0, i + 1).join('/')}
                    onClick={() => onFolder(parts.slice(0, i + 1).join('/'))}
                  >
                    {part}
                  </button>
                </span>
              ))}
        </nav>
        {locationActions}
      </div>
      <div className="library-toolbar">
        <label className="library-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label={t('images.search')}
            placeholder={t('images.search')}
            value={query}
            disabled={disabled}
            onChange={(e) => {
              onQuery(e.target.value);
              if (!(e.nativeEvent as InputEvent).isComposing) onSearch(e.target.value);
            }}
            onCompositionEnd={(e) => onSearch(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Escape' &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                onQuery('');
                onSearch('');
                e.stopPropagation();
              }
            }}
          />
        </label>
        {size}
      </div>
      {children}
    </>
  );
}
