import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/ui-icons';
import {
  inputPaletteRowHeight as rowHeight,
  type InputPaletteApi,
  type InputPaletteModel,
} from '../../shared/input-palette';
import '../theme.css';
import './window.css';
declare global {
  interface Window {
    inputPalette: InputPaletteApi;
  }
}

function Palette() {
  const [model, setModel] = useState<InputPaletteModel | null>(null);
  const current = useRef('');
  const currentView = useRef(0);
  const restored = useRef<InputPaletteModel | null>(null);
  const [selected, select] = useState(0),
    [top, scroll] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const reveal = (index: number) => {
    const el = list.current;
    if (!el) return;
    const y = index * rowHeight;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + rowHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = y + rowHeight - el.clientHeight;
  };
  useEffect(() => {
    window.inputPalette.captureView((session, view) => {
      if (current.current === session && currentView.current === view)
        window.inputPalette.viewState(session, view, list.current?.scrollTop ?? 0);
    });
    window.inputPalette.selected((session, view, index) => {
      if (current.current === session && currentView.current === view) {
        select(index);
        reveal(index);
      }
    });
    window.inputPalette.models((next) => {
      current.current = next?.session ?? '';
      currentView.current = next?.view ?? 0;
      setModel(next);
      select(next?.selected ?? 0);
      scroll(next?.scrollTop ?? 0);
    });
  }, []);
  useEffect(() => {
    if (model) window.inputPalette.ready(model.session, model.view);
  }, [model]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (restored.current !== model) {
      restored.current = model;
      el.scrollTop = model?.scrollTop ?? 0;
      if (!model?.restoreScroll || selected !== model.selected) reveal(selected);
      return;
    }
    reveal(selected);
  }, [selected, model]);
  if (!model) return null;
  const start = Math.max(0, Math.floor(top / rowHeight) - 1);
  const count = Math.ceil(window.innerHeight / rowHeight) + 2;
  return (
    <>
      <header data-palette-session={model.session}>
        <strong>{model.title}</strong>
        {model.kind === 'snippets' && (
          <button
            className="manage"
            type="button"
            title={model.manage}
            aria-label={model.manage}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => window.inputPalette.manage(model.session, model.view)}
          >
            <Icon name="file" />
          </button>
        )}
      </header>
      <div
        className="choices"
        ref={list}
        onScroll={(e) => {
          const value = e.currentTarget.scrollTop;
          scroll(value);
          window.inputPalette.scroll(model.session, model.view, value);
        }}
      >
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
                  title={r.title}
                  style={{ top: index * rowHeight, height: rowHeight }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => window.inputPalette.choose(model.session, model.view, index)}
                >
                  {r.thumbnail && <img alt="" src={r.thumbnail} />}
                  <strong>{r.name}</strong>
                  <span>{r.preview}</span>
                  {index < 10 && <kbd aria-hidden="true">{(index + 1) % 10}</kbd>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <footer>
        <span title={model.keys}>{model.keys}</span>
        <span title={model.keyHelp}>{model.keyHelp}</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Palette />);
