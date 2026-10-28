import { useRef, type ReactNode, type RefObject } from 'react';
import type { SettingsIndexModel, SettingsPageOperation } from '../../shared/settings-page';
import { useHostTranslation } from '../HostTranslation';
import { SettingsIndex } from './SettingsIndex';

/** Keep the same index and body bounds while the page connection is being prepared. */
export function SettingsPageFrame({
  surface,
  context,
  connectionId,
  index,
  sidebarWidth,
  hostWidth,
  pending,
  act,
  resize,
  children,
}: {
  surface: RefObject<HTMLDivElement | null>;
  context: 'full' | 'applet';
  connectionId?: string;
  index?: SettingsIndexModel;
  sidebarWidth: number;
  hostWidth: number;
  pending: boolean;
  act(operation: SettingsPageOperation): void;
  resize(width: number): void;
  children: ReactNode;
}) {
  const { t } = useHostTranslation();
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      ref={surface}
      data-settings-connection={connectionId}
      className={`settings-surface ${context}`}
      data-compact={hostWidth <= 760}
    >
      {context === 'full' && (
        <aside
          className="sidebar settings-categories"
          data-testid="settings-index"
          style={{ width: Math.min(sidebarWidth, hostWidth * 0.4) }}
          aria-label={t('settings.index')}
        >
          {index && <SettingsIndex content={index} act={act} pending={pending} />}
          <div
            className="sidebar-resizer"
            role="separator"
            tabIndex={pending ? -1 : 0}
            aria-disabled={pending}
            aria-label={t('settings.resizeIndex')}
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={480}
            aria-valuenow={sidebarWidth}
            onPointerDown={(event) => {
              if (pending || event.button !== 0) return;
              event.preventDefault();
              drag.current = {
                x: event.clientX,
                width: event.currentTarget.parentElement!.getBoundingClientRect().width,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
            }}
            onPointerUp={(event) => {
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => (drag.current = null)}
            onKeyDown={(event) => {
              if (pending) return;
              const width = {
                ArrowLeft: sidebarWidth - 10,
                ArrowRight: sidebarWidth + 10,
                Home: 220,
                End: 480,
              }[event.key];
              if (width !== undefined) {
                event.preventDefault();
                resize(width);
              }
            }}
          />
        </aside>
      )}
      {children}
    </div>
  );
}
