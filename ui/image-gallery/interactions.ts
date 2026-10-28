import type { GalleryModel } from '../../src/shared/image-gallery';

export interface GalleryInteractions {
  root: HTMLElement;
  viewport(): { top: number; bottom: number; left: number; right: number };
  enabled(): boolean;
  canReorder(): boolean;
  beginDrag(imageId: string): Promise<{ token: string; count: number }>;
  drop(token: string, groupId: string): void;
  reorder(token: string, imageId: string, after: boolean): void;
  clear(): void;
  selectRange(imageIds: string[], additive: boolean): void;
  targets(): { element: HTMLElement; id: string }[];
  scrollTargets(): HTMLElement[];
  more(): void;
}

/** Pointer gestures only describe intent; the owner validates and saves operations. */
export function mountGalleryInteractions(
  container: HTMLElement,
  scroll: HTMLElement,
  model: () => GalleryModel,
  options: GalleryInteractions,
) {
  type Gesture = {
    pointerId: number;
    startX: number;
    startY: number;
    contentY: number;
    selectionY: number;
    x: number;
    y: number;
    additive: boolean;
    imageId?: string;
    active: boolean;
    selection: string[];
    transfer?: Promise<{ token: string; count: number }>;
    target?: { element: HTMLElement; id: string };
    insertion?: { imageId: string; after: boolean };
  };
  let gesture: Gesture | undefined;
  let frame = 0,
    lastTime = 0,
    suppressClick = false;
  const rectangle = document.createElement('div');
  rectangle.className = 'ad-gallery-marquee';
  rectangle.dataset.testid = 'gallery-selection-area';
  const badge = document.createElement('div');
  badge.className = 'ad-gallery-drag-badge';
  badge.dataset.testid = 'gallery-drag-card';
  badge.setAttribute('aria-hidden', 'true');
  const preview = document.createElement('img');
  preview.draggable = false;
  const count = document.createElement('span');
  count.dataset.testid = 'gallery-drag-count';
  badge.append(preview, count);
  const insertion = document.createElement('div');
  insertion.className = 'ad-gallery-insertion';
  insertion.dataset.testid = 'gallery-insertion';
  const resetVisuals = () => {
    rectangle.remove();
    badge.remove();
    insertion.remove();
    gesture?.target?.element.removeAttribute('data-gallery-drop');
    options.root.classList.remove('ad-gallery-gesturing');
    const selected = new Set(
      model()
        .items.filter((item) => item.selected)
        .map((item) => item.id),
    );
    for (const node of container.querySelectorAll<HTMLElement>('[data-image-id]'))
      node.classList.toggle('ad-gallery-selected', selected.has(node.dataset.imageId!));
  };
  const cancel = () => {
    if (gesture?.active) suppressClick = true;
    resetVisuals();
    gesture = undefined;
    cancelAnimationFrame(frame);
  };
  const draw = () => {
    const g = gesture;
    if (!g?.active) return;
    if (g.imageId) {
      badge.style.left = `${g.x + 200 > window.innerWidth ? g.x - 194 : g.x + 14}px`;
      badge.style.top = `${g.y + 190 > window.innerHeight ? g.y - 184 : g.y + 14}px`;
      const hit = document.elementFromPoint(g.x, g.y);
      const target = options
        .targets()
        .find(
          (candidate) =>
            !candidate.element.matches(':disabled') && !!hit && candidate.element.contains(hit),
        );
      if (target?.element !== g.target?.element) {
        g.target?.element.removeAttribute('data-gallery-drop');
        target?.element.setAttribute('data-gallery-drop', 'true');
        g.target = target;
      }
      g.insertion = undefined;
      insertion.remove();
      const card = hit?.closest<HTMLElement>('[data-image-id]');
      const dragged = model().items.find((item) => item.id === g.imageId);
      const item = model().items.find((item) => item.id === card?.dataset.imageId);
      const viewport = options.viewport();
      if (
        !target &&
        options.canReorder() &&
        card &&
        container.contains(card) &&
        item &&
        item.id !== g.imageId &&
        !(dragged?.selected && item.selected) &&
        g.y >= viewport.top &&
        g.y <= viewport.bottom
      ) {
        const r = card.getBoundingClientRect();
        const after = g.x >= r.left + r.width / 2;
        g.insertion = { imageId: item.id, after };
        Object.assign(insertion.style, {
          left: `${(after ? r.right : r.left) - 2}px`,
          top: `${Math.max(r.top, viewport.top)}px`,
          height: `${Math.min(r.bottom, viewport.bottom) - Math.max(r.top, viewport.top)}px`,
        });
        document.body.append(insertion);
      }
      badge.dataset.valid = String(!!target || !!g.insertion);
      return;
    }
    const viewport = options.root.getBoundingClientRect();
    const originY = scroll.getBoundingClientRect().top + g.contentY - scroll.scrollTop;
    const selectionY = scroll.getBoundingClientRect().top + g.selectionY - scroll.scrollTop;
    const endY = Math.max(options.viewport().top, Math.min(g.y, options.viewport().bottom));
    const x = Math.max(viewport.left, Math.min(g.x, viewport.right));
    const y = Math.max(viewport.top, Math.min(g.y, viewport.bottom));
    const left = Math.min(g.startX, x),
      right = Math.max(g.startX, x);
    const top = Math.min(originY, y),
      bottom = Math.max(originY, y);
    Object.assign(rectangle.style, {
      left: `${left}px`,
      top: `${Math.max(top, viewport.top)}px`,
      width: `${right - left}px`,
      height: `${Math.max(0, Math.min(bottom, viewport.bottom) - Math.max(top, viewport.top))}px`,
    });
    const items = new Map(model().items.map((item) => [item.id, item]));
    g.selection = [];
    for (const node of container.querySelectorAll<HTMLElement>('[data-image-id]')) {
      const item = items.get(node.dataset.imageId!);
      if (!item) continue;
      const r = node.getBoundingClientRect();
      const hit =
        item.selectable !== false &&
        r.right > left &&
        r.left < right &&
        r.bottom > Math.min(selectionY, endY) &&
        r.top < Math.max(selectionY, endY);
      if (hit) g.selection.push(item.id);
      node.classList.toggle('ad-gallery-selected', hit || (g.additive && !!item.selected));
    }
  };
  const tick = (time: number) => {
    const g = gesture;
    if (!g?.active) return;
    if (!options.enabled()) {
      cancel();
      return;
    }
    const elapsed = Math.min(32, time - (lastTime || time));
    lastTime = time;
    for (const scroller of g.imageId ? options.scrollTargets() : [scroll]) {
      const r = scroller === scroll ? options.viewport() : scroller.getBoundingClientRect();
      if (g.x < r.left || g.x > r.right || g.y < r.top - 32 || g.y > r.bottom + 32) continue;
      const speed =
        g.y < r.top + 48
          ? -Math.min(1, (r.top + 48 - g.y) / 48)
          : g.y > r.bottom - 48
            ? Math.min(1, (g.y - r.bottom + 48) / 48)
            : 0;
      scroller.scrollTop += speed * elapsed * 0.8;
      if (
        scroller === scroll &&
        speed > 0 &&
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64
      )
        options.more();
    }
    draw();
    frame = requestAnimationFrame(tick);
  };
  const down = (e: PointerEvent) => {
    suppressClick = false;
    if (e.button !== 0 || !e.isPrimary || !options.enabled() || model().selection !== 'multiple')
      return;
    const target = e.target instanceof Element ? e.target : undefined;
    if (!target || !options.root.contains(target)) return;
    if (
      target.closest(
        'input, label, select, textarea, a, summary, [contenteditable], [role="menu"], button:not(.ad-gallery-image)',
      )
    )
      return;
    const bounds = scroll.getBoundingClientRect();
    for (const scroller of [scroll, ...options.scrollTargets()]) {
      const r = scroller.getBoundingClientRect();
      if (
        scroller.contains(target) &&
        (e.clientX >= r.left + scroller.clientWidth || e.clientY >= r.top + scroller.clientHeight)
      )
        return;
    }
    const card = target.closest<HTMLElement>('[data-image-id]');
    const item = model().items.find((item) => item.id === card?.dataset.imageId);
    if (card && (!item || item.selectable === false)) return;
    cancel();
    gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      contentY: e.clientY - bounds.top + scroll.scrollTop,
      selectionY: Math.max(e.clientY, options.viewport().top) - bounds.top + scroll.scrollTop,
      x: e.clientX,
      y: e.clientY,
      additive: e.ctrlKey || e.metaKey,
      imageId: item?.id,
      active: false,
      selection: [],
    };
  };
  const move = (e: PointerEvent) => {
    const g = gesture;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!options.enabled() || !(e.buttons & 1)) {
      cancel();
      return;
    }
    g.x = e.clientX;
    g.y = e.clientY;
    if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) < 6) return;
    e.preventDefault();
    if (!g.active) {
      g.active = true;
      options.root.classList.add('ad-gallery-gesturing');
      window.getSelection()?.removeAllRanges();
      if (g.imageId) {
        count.textContent = '…';
        badge.dataset.multiple = 'false';
        const card = [...container.querySelectorAll<HTMLElement>('[data-image-id]')].find(
          (node) => node.dataset.imageId === g.imageId,
        );
        const source = card?.querySelector<HTMLImageElement>('img');
        if (source?.getAttribute('src')) preview.src = source.src;
        else preview.removeAttribute('src');
        preview.alt = model().items.find((item) => item.id === g.imageId)?.title ?? '';
        document.body.append(badge);
        g.transfer = options.beginDrag(g.imageId);
        void g.transfer
          .then((result) => {
            if (gesture === g) {
              count.textContent = `${result.count}枚`;
              badge.dataset.multiple = String(result.count > 1);
            }
          })
          .catch(() => {
            if (gesture === g) cancel();
          });
      } else document.body.append(rectangle);
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
    draw();
  };
  const up = (e: PointerEvent) => {
    const g = gesture;
    if (!g || g.pointerId !== e.pointerId) return;
    g.x = e.clientX;
    g.y = e.clientY;
    draw();
    const target = g.target;
    const destination = g.insertion;
    const enabled = options.enabled();
    cancel();
    if (!enabled) return;
    if (!g.active) {
      if (!g.imageId && !g.additive) options.clear();
      return;
    }
    e.preventDefault();
    if (g.transfer && target)
      void g.transfer
        .then(({ token }) => {
          if (options.enabled()) options.drop(token, target.id);
        })
        .catch(() => {});
    else if (g.transfer && destination)
      void g.transfer
        .then(({ token }) => {
          if (options.enabled()) options.reorder(token, destination.imageId, destination.after);
        })
        .catch(() => {});
    else if (!g.imageId) options.selectRange(g.selection, g.additive);
  };
  const click = (e: MouseEvent) => {
    if (!suppressClick || e.detail === 0) return;
    suppressClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && gesture) {
      cancel();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const nativeDrag = (e: DragEvent) => {
    if (gesture) e.preventDefault();
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('click', click, true);
  window.addEventListener('keydown', key, true);
  scroll.addEventListener('dragstart', nativeDrag);
  return {
    cancel,
    update: draw,
    dispose() {
      cancel();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key, true);
      scroll.removeEventListener('dragstart', nativeDrag);
    },
  };
}
