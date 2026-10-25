import { useLayoutEffect, type RefObject } from 'react';

/** Follow the vertical page scroll while staying inside each rowspan cell.
 * The table has its own horizontal overflow, so CSS sticky would choose that
 * non-scrolling vertical ancestor instead of the settings body.
 */
export function useCommandCellFollow(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const list = root.current;
    const body = list?.closest<HTMLElement>('.settings-body');
    if (!enabled || !list || !body) return;
    const toolbar = body.querySelector<HTMLElement>('.command-list-toolbar');
    let frame = 0;
    let active = true;
    let summaries: HTMLElement[] = [];
    let observed = new Set<Element>();
    const measure = () => {
      frame = 0;
      if (!active) return;
      const viewport = body.getBoundingClientRect();
      const top =
        Math.max(
          viewport.top + body.clientTop,
          toolbar?.getBoundingClientRect().bottom ?? viewport.top,
        ) + 8;
      const changes = summaries.map((summary) => {
        const cell = summary.parentElement!;
        const rect = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const limit = Math.max(
          0,
          cell.clientHeight - paddingTop - paddingBottom - summary.offsetHeight,
        );
        const offset =
          rect.bottom > viewport.top && rect.top < viewport.bottom
            ? Math.min(limit, Math.max(0, top - rect.top - paddingTop))
            : 0;
        return { summary, transform: offset > 0 ? `translateY(${offset}px)` : '' };
      });
      for (const { summary, transform } of changes)
        if (summary.style.transform !== transform) summary.style.transform = transform;
    };
    const schedule = () => {
      if (active && !frame) frame = requestAnimationFrame(measure);
    };
    const sizes = new ResizeObserver(schedule);
    const collect = () => {
      summaries = [...list.querySelectorAll<HTMLElement>('.binding-command-summary')];
      const next = new Set<Element>([
        body,
        ...(toolbar ? [toolbar] : []),
        ...summaries,
        ...summaries.map((summary) => summary.parentElement!),
      ]);
      for (const element of observed) if (!next.has(element)) sizes.unobserve(element);
      for (const element of next) if (!observed.has(element)) sizes.observe(element);
      observed = next;
      schedule();
    };
    const mutations = new MutationObserver(collect);
    mutations.observe(list, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['rowspan'],
    });
    body.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('focus', schedule);
    collect();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
      body.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('focus', schedule);
      for (const summary of summaries) summary.style.removeProperty('transform');
    };
  }, [root, enabled]);
}
