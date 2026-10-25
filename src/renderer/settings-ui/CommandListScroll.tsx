import { useHostTranslation } from '../HostTranslation';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
} from 'react';

/** An unframed command list; preserve its search anchor and status without a card heading. */
export function CommandListSection({
  title,
  description,
  children,
  className = '',
  ...props
}: {
  title: string;
  description?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`command-list-section ${className}`} aria-label={title} {...props}>
      {description && <p className="command-list-description">{description}</p>}
      {children}
    </section>
  );
}

const CommandListScrollContext = createContext<{
  viewport: HTMLElement | null;
  register(element: HTMLElement): () => void;
} | null>(null);

export function CommandListScrollProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const register = useCallback((element: HTMLElement) => {
    setViewport(element);
    return () => setViewport((current) => (current === element ? null : current));
  }, []);
  return (
    <CommandListScrollContext.Provider value={{ viewport, register }}>
      {children}
    </CommandListScrollContext.Provider>
  );
}

/** Opt in per table; other settings lists retain their native scrollbar. */
export function useCommandListScroll(ref: RefObject<HTMLDivElement | null>, enabled = true) {
  const register = useContext(CommandListScrollContext)?.register;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !register) return;
    element.classList.add('command-list-page-scroll');
    const unregister = register(element);
    return () => {
      element.classList.remove('command-list-page-scroll');
      unregister();
    };
  }, [enabled, ref, register]);
}

/** Keep filters outside the table's horizontal scroll container. */
export function CommandListToolbar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    const body = element.closest<HTMLElement>('.settings-body');
    if (!body) return;
    const measure = () =>
      body.style.setProperty('--command-list-toolbar-height', `${element.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      body.style.removeProperty('--command-list-toolbar-height');
    };
  }, []);
  return (
    <div className="command-list-toolbar" ref={ref}>
      {children}
    </div>
  );
}

/** Filters and actions precede the result count at the trailing edge. */
export function CommandListSummary({
  leading,
  children,
  filter,
  actions,
  className = '',
}: {
  leading?: ReactNode;
  children: ReactNode;
  filter?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <div className={`command-list-summary ${className}`}>
      {leading && <div className="command-list-summary-leading">{leading}</div>}
      {filter && <div className="command-list-summary-main">{filter}</div>}
      {actions && <div className="command-list-summary-actions">{actions}</div>}
      <div className="command-list-summary-count">{children}</div>
    </div>
  );
}

/** A native, keyboard-accessible horizontal scrollbar below the page scrollport. */
export function CommandListScrollbar() {
  const { t: translate } = useHostTranslation();
  const viewport = useContext(CommandListScrollContext)?.viewport;
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = slotRef.current!,
      bar = barRef.current!,
      track = trackRef.current!;
    slot.hidden = true;
    if (!viewport) return;
    const body = viewport.closest<HTMLElement>('.settings-body');
    if (!body) return;
    let frame = 0;
    let content: Element | null = null;
    let expectedTableLeft: number | undefined;
    let expectedBarLeft: number | undefined;
    const observer = new ResizeObserver(() => schedule());
    const measure = () => {
      frame = 0;
      const nextContent = viewport.querySelector('table');
      if (nextContent !== content) {
        if (content) observer.unobserve(content);
        content = nextContent;
        if (content) observer.observe(content);
      }
      const rect = viewport.getBoundingClientRect(),
        page = body.getBoundingClientRect();
      const needed = viewport.scrollWidth > viewport.clientWidth + 1;
      // Leave the scrollbar available even when the table begins below the filters.
      slot.hidden = !needed;
      bar.style.marginLeft = `${Math.max(0, rect.left + viewport.clientLeft - page.left)}px`;
      bar.style.width = `${viewport.clientWidth}px`;
      track.style.width = `${viewport.scrollWidth}px`;
      if (Math.abs(bar.scrollLeft - viewport.scrollLeft) > 1) {
        bar.scrollLeft = viewport.scrollLeft;
        expectedBarLeft = bar.scrollLeft;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const fromTable = () => {
      const expected = expectedTableLeft;
      expectedTableLeft = undefined;
      if (expected !== undefined && Math.abs(viewport.scrollLeft - expected) <= 1) return;
      if (Math.abs(bar.scrollLeft - viewport.scrollLeft) > 1) {
        bar.scrollLeft = viewport.scrollLeft;
        expectedBarLeft = bar.scrollLeft;
      }
    };
    const fromBar = () => {
      const expected = expectedBarLeft;
      expectedBarLeft = undefined;
      if (expected !== undefined && Math.abs(bar.scrollLeft - expected) <= 1) return;
      if (Math.abs(viewport.scrollLeft - bar.scrollLeft) > 1) {
        viewport.scrollLeft = bar.scrollLeft;
        expectedTableLeft = viewport.scrollLeft;
      }
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(viewport, { childList: true, subtree: true });
    observer.observe(viewport);
    observer.observe(body);
    viewport.addEventListener('scroll', fromTable, { passive: true });
    bar.addEventListener('scroll', fromBar, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      viewport.removeEventListener('scroll', fromTable);
      bar.removeEventListener('scroll', fromBar);
    };
  }, [viewport]);
  return (
    <div className="command-list-scrollbar-slot" ref={slotRef} hidden>
      <div
        className="command-list-scrollbar"
        ref={barRef}
        tabIndex={0}
        role="region"
        aria-label={translate('settings.commandListScroll.horizontalScroll')}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const bar = event.currentTarget;
          const destination = {
            ArrowLeft: bar.scrollLeft - 40,
            ArrowRight: bar.scrollLeft + 40,
            Home: 0,
            End: bar.scrollWidth,
          }[event.key];
          if (destination === undefined) return;
          event.preventDefault();
          bar.scrollLeft = destination;
        }}
      >
        <div ref={trackRef} />
      </div>
    </div>
  );
}
