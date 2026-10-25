import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GestureSettings } from '../../shared/gestures';
import { useHostTranslation } from '../HostTranslation';
import { GestureIndicatorView } from '../gesture-indicator/GestureIndicatorView';
import './gesture-indicator-preview.css';

const styleKeys = {
  compact: 'settings.gestureOptions.styleCompact',
  pill: 'settings.gestureOptions.stylePill',
  ring: 'settings.gestureOptions.styleRing',
  classic: 'settings.gestureOptions.styleClassic',
} as const;

/** A scaled local sample; choosing or viewing it never captures input or executes commands. */
export function GestureIndicatorPreview({
  style,
  opacity,
  hidden,
}: {
  style: GestureSettings['indicatorStyle'];
  opacity: number;
  hidden: boolean;
}) {
  const { t } = useHostTranslation();
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const width = style === 'classic' ? 500 : style === 'pill' ? 400 : 320;
    const maximum = style === 'classic' ? 0.7 : 0.85;
    const update = () =>
      setScale(Math.max(0.1, Math.min(maximum, (element.clientWidth - 32) / width)));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [style]);
  return (
    <div
      ref={stage}
      className="gesture-preview-stage"
      data-testid="gesture-indicator-preview"
      data-style={style}
      data-hidden={hidden}
      role="img"
      aria-label={
        hidden
          ? t('settings.gestureOptions.hidden')
          : t('settings.gestureOptions.previewLabel', { style: t(styleKeys[style]) })
      }
      style={
        { '--gesture-preview-opacity': opacity, '--gesture-preview-scale': scale } as CSSProperties
      }
    >
      {hidden ? (
        <span className="gesture-preview-hidden">{t('settings.gestureOptions.hidden')}</span>
      ) : (
        <GestureIndicatorView
          model={{
            x: 0,
            y: 0,
            style,
            opacity,
            process: 'explorer.exe',
            directions: ['right', 'up'],
            captions: [t('settings.gestureOptions.previewCommand')],
            captionRows: 1,
          }}
        />
      )}
    </div>
  );
}
