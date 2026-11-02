import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { InputPaletteApi, InputPaletteModel } from '../../shared/input-palette';
import '../theme.css';
import './window.css';
declare global {
  interface Window {
    inputPalette: InputPaletteApi;
  }
}

const rowHeight = 50;
function Palette() {
  const [model, setModel] = useState<InputPaletteModel | null>(null);
  const current = useRef('');
  const [selected, select] = useState(0),
    [top, scroll] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.inputPalette.selected((session, index) => {
      if (current.current === session) select(index);
    });
    window.inputPalette.models((next) => {
      current.current = next?.session ?? '';
      setModel(next);
      select(next?.selected ?? 0);
      scroll(0);
      if (list.current) list.current.scrollTop = 0;
    });
  }, []);
  useEffect(() => {
    if (model) window.inputPalette.ready(model.session);
  }, [model]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const y = selected * rowHeight;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + rowHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = y + rowHeight - el.clientHeight;
  }, [selected, model]);
  if (!model) return null;
  const start = Math.max(0, Math.floor(top / rowHeight) - 1);
  const count = Math.ceil(window.innerHeight / rowHeight) + 2;
  return (
    <>
      <header data-palette-session={model.session}>
        <strong>{model.title}</strong>
        <span>{model.mode}</span>
      </header>
      <div className="choices" ref={list} onScroll={(e) => scroll(e.currentTarget.scrollTop)}>
        {model.rows.length === 0 ? (
          <p>{model.empty}</p>
        ) : (
          <div style={{ height: model.rows.length * rowHeight, position: 'relative' }}>
            {model.rows.slice(start, start + count).map((r, i) => {
              const index = start + i;
              return (
                <button
                  key={index}
                  type="button"
                  aria-current={index === selected}
                  data-index={index}
                  style={{ top: index * rowHeight, height: rowHeight }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => window.inputPalette.choose(model.session, index)}
                >
                  {r.thumbnail && <img alt="" src={r.thumbnail} />}
                  <strong>{r.name}</strong>
                  <span>{r.preview}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <footer>{model.keys}</footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Palette />);
