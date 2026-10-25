import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GestureSettings } from '../../shared/gestures';
import { useHostTranslation } from '../HostTranslation';
import { Icon } from '../Icon';
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
  const arrows = (
    <div
      className="gesture-preview-arrows"
      aria-label={t('settings.gestureOptions.previewDirection')}
    >
      <Icon name="arrow" size={32} />
      <span className="gesture-preview-arrow-up">
        <Icon name="arrow" size={32} />
      </span>
    </div>
  );
  const caption = (
    <div className="gesture-preview-caption">{t('settings.gestureOptions.previewCommand')}</div>
  );
  const process = <div className="gesture-preview-process">explorer.exe</div>;
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
        <div className={`gesture-preview-indicator gesture-preview-${style}`} aria-hidden="true">
          {style === 'classic' ? (
            <>
              {process}
              <div className="gesture-preview-emoji">➡️⬆️</div>
              {caption}
            </>
          ) : style === 'ring' ? (
            <>
              <div className="gesture-preview-ring-circle">{arrows}</div>
              <div className="gesture-preview-ring-label">
                {process}
                {caption}
              </div>
            </>
          ) : style === 'pill' ? (
            <>
              {arrows}
              <div className="gesture-preview-pill-label">
                {process}
                {caption}
              </div>
            </>
          ) : (
            <>
              {process}
              {arrows}
              {caption}
            </>
          )}
        </div>
      )}
    </div>
  );
}
