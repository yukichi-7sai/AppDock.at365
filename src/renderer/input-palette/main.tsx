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
  const [viewport, setViewport] = useState(0);
  const drag = useRef<{
    pointer: number;
    session: string;
    view: number;
    x: number;
    y: number;
  } | null>(null);
  const finishResize = () => {
    const value = drag.current;
    drag.current = null;
    if (value) window.inputPalette.resize(value.session, value.view, 'end', value.x, value.y);
  };
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
    const update = () => setViewport(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      finishResize();
    };
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
  const count = Math.ceil(viewport / rowHeight) + 2;
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
      <footer className={model.guide ? undefined : 'compact'}>
        {model.guide && (
          <>
            <span title={model.keys}>{model.keys}</span>
            <span title={model.keyHelp}>{model.keyHelp}</span>
          </>
        )}
        <button
          key={model.session + ':' + model.view}
          className="resize-handle"
          type="button"
          tabIndex={-1}
          title={model.resize}
          aria-label={model.resize}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              pointer: e.pointerId,
              session: model.session,
              view: model.view,
              x: e.clientX,
              y: e.clientY,
            };
            window.inputPalette.resize(model.session, model.view, 'start', e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            const value = drag.current;
            if (!value || value.pointer !== e.pointerId) return;
            value.x = e.clientX;
            value.y = e.clientY;
            window.inputPalette.resize(value.session, value.view, 'move', value.x, value.y);
          }}
          onPointerUp={(e) => {
            if (drag.current?.pointer !== e.pointerId) return;
            drag.current.x = e.clientX;
            drag.current.y = e.clientY;
            finishResize();
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 13 13 5M10 13l3-3" />
          </svg>
        </button>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Palette />);
