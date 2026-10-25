import type { CSSProperties } from 'react';
import type { GestureIndicatorModel, IndicatorDirection } from '../../shared/gesture-indicator';
import { Icon } from '../Icon';
import '../settings/gesture-indicator-preview.css';

const angles: Record<IndicatorDirection, number> = { right: 0, down: 90, left: 180, up: -90 };
const marks: Record<IndicatorDirection, string> = { right: '➡️', down: '⬇️', left: '⬅️', up: '⬆️' };
export function GestureIndicatorView({ model }: { model: GestureIndicatorModel }) {
  const arrows = (
    <div className="gesture-preview-arrows" aria-hidden="true">
      {model.directions.map((direction, index) => (
        <span key={index} style={{ transform: `rotate(${angles[direction]}deg)` }}>
          <Icon name="arrow" size={32} />
        </span>
      ))}
    </div>
  );
  const process = <div className="gesture-preview-process">{model.process}</div>;
  const captions = (
    <div className="gesture-indicator-captions">
      {model.captions.map((caption, index) => (
        <div className="gesture-preview-caption" key={index}>
          {caption.replace(/\r\n|\r|\n/g, ' ')}
        </div>
      ))}
    </div>
  );
  const style = {
    '--gesture-preview-opacity': model.opacity,
    '--gesture-caption-rows': Math.max(1, model.captionRows, model.captions.length),
  } as CSSProperties;
  return (
    <div
      className={`gesture-preview-indicator gesture-preview-${model.style}`}
      style={style}
      aria-hidden="true"
    >
      {model.style === 'classic' ? (
        <>
          {process}
          <div className="gesture-preview-emoji">
            {model.directions.map((direction) => marks[direction]).join('')}
          </div>
          {captions}
        </>
      ) : model.style === 'ring' ? (
        <>
          <div className="gesture-preview-ring-circle">{arrows}</div>
          <div className="gesture-preview-ring-label">
            {process}
            {captions}
          </div>
        </>
      ) : model.style === 'pill' ? (
        <>
          {arrows}
          <div className="gesture-preview-pill-label">
            {process}
            {captions}
          </div>
        </>
      ) : (
        <>
          {process}
          {arrows}
          {captions}
        </>
      )}
    </div>
  );
}
