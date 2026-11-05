import { hostText } from '../../shared/i18n';
import {
  gallerySize,
  validGalleryWidth,
  type GalleryAnchor,
  type GalleryItem,
  type GalleryModel,
  type GallerySize,
} from '../../shared/image-gallery';
export * from '../../shared/image-gallery';
import { mountGalleryInteractions, type GalleryInteractions } from './interactions';

export interface GalleryOptions {
  errorText?: string;
  /** Show the complete group list; the owning surface provides wrapping/scrolling. */
  expandLabels?: boolean;
  size?: GallerySize;
  /** Library selection and context menus are opt-in; picker activation stays unchanged. */
  clickSelect?(id: string, event: MouseEvent): void;
  context?(id: string, event: MouseEvent | KeyboardEvent, opener: HTMLElement): void;
  interactions?: GalleryInteractions;
  scrollElement: HTMLElement;
  image(assetId: string, edge: number): Promise<string>;
  select(id: string, selected: boolean): void;
  activate(id: string): void;
  action(id: string, actionId: string): void;
}
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
type Card = {
  node: HTMLElement;
  button: HTMLButtonElement;
  image: HTMLImageElement;
  text: HTMLElement;
  check: HTMLInputElement;
  checkArea: HTMLLabelElement;
  title: HTMLElement;
  detail: HTMLElement;
  labels: HTMLElement;
  status: HTMLElement;
  actions: HTMLElement;
  item: GalleryItem;
  visible: boolean;
  edge: number;
  requested: number;
  generation: number;
  loading: boolean;
};
const safeImage = (source: string) =>
  /^(data:image\/(?:png|jpeg|webp);base64,|blob:|appdock:\/\/page-images\/)/.test(source);
/** Keyed DOM updates preserve focused controls, decoded images and the visible anchor. */
export function mountImageGallery(container: HTMLElement, options: GalleryOptions) {
  container.classList.add('ad-gallery');
  const cards = new Map<string, Card>();
  let model: GalleryModel = {
    items: [],
    cardWidth: gallerySize.initial,
    fit: 'contain',
    selection: 'none',
    empty: '',
  };
  let disposed = false,
    active = 0,
    frame = 0;
  const interactions = options.interactions
    ? mountGalleryInteractions(container, options.scrollElement, () => model, options.interactions)
    : undefined;
  const empty = element('p', 'ad-gallery-empty');
  const wantedEdge = (card: Card) => {
    const width = card.button.getBoundingClientRect().width || model.cardWidth;
    const edges =
      options.size && options.size.min < 120 ? [64, 512, 1024, 2048] : [512, 1024, 2048];
    return edges.find((v) => v >= width * window.devicePixelRatio) ?? 2048;
  };
  const pump = () => {
    if (disposed) return;
    for (const card of cards.values()) {
      if (active >= 3) break;
      const edge = wantedEdge(card);
      if (
        !card.visible ||
        card.loading ||
        card.item.state !== 'ready' ||
        !card.item.assetId ||
        card.edge >= edge ||
        card.requested >= edge
      )
        continue;
      const generation = card.generation,
        assetId = card.item.assetId;
      card.loading = true;
      card.requested = edge;
      active++;
      card.status.textContent = card.image.hasAttribute('src') ? '' : hostText('gallery.loading');
      card.status.dataset.state = 'loading';
      void options
        .image(assetId, edge)
        .then(async (source) => {
          if (disposed || generation !== card.generation || !card.visible) return;
          // Only image URLs supplied by the adapter; never interpret markup.
          if (!safeImage(source)) throw Error(options.errorText ?? hostText('gallery.readFailed'));
          const decoded = new Image();
          decoded.src = source;
          await decoded.decode();
          if (disposed || generation !== card.generation || !card.visible) return;
          card.image.src = source;
          card.edge = edge;
          card.status.textContent = '';
        })
        .catch(() => {
          if (!disposed && generation === card.generation) {
            card.status.textContent = options.errorText ?? hostText('gallery.readFailed');
            card.status.dataset.state = 'error';
          }
        })
        .finally(() => {
          active--;
          card.loading = false;
          if (generation !== card.generation) card.requested = 0;
          pump();
        });
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const card = cards.get((entry.target as HTMLElement).dataset.imageId!);
        if (card) {
          card.visible = entry.isIntersecting;
          // Invalidate pending replies too: an image may leave before its first decode.
          if (!card.visible) {
            card.image.removeAttribute('src');
            card.edge = 0;
            card.requested = 0;
            card.generation++;
          }
        }
      }
      pump();
    },
    { root: options.scrollElement, rootMargin: '300px' },
  );
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(pump);
  });
  resize.observe(container);
  const anchor = (): GalleryAnchor | undefined => {
    const top =
      options.interactions?.viewport().top ?? options.scrollElement.getBoundingClientRect().top;
    for (const child of container.children) {
      const card = cards.get((child as HTMLElement).dataset.imageId!);
      if (!card) continue;
      const r = card.node.getBoundingClientRect();
      if (r.bottom > top) return { id: card.item.id, offset: r.top - top };
    }
  };
  const restore = (value?: GalleryAnchor) => {
    if (!value) return;
    const card = cards.get(value.id);
    if (card)
      options.scrollElement.scrollTop +=
        card.node.getBoundingClientRect().top -
        (options.interactions?.viewport().top ??
          options.scrollElement.getBoundingClientRect().top) -
        value.offset;
  };
  const create = (item: GalleryItem) => {
    const node = element('article', 'ad-gallery-card');
    node.dataset.imageId = item.id;
    const button = element('button', 'ad-gallery-image');
    button.type = 'button';
    const image = element('img', '');
    image.draggable = false;
    image.alt = '';
    image.decoding = 'async';
    const status = element('span', 'ad-gallery-status');
    const text = element('span', 'ad-gallery-text');
    text.hidden = true;
    button.append(image, text, status);
    const check = element('input', 'ad-gallery-check');
    check.type = 'checkbox';
    const checkArea = element('label', 'ad-gallery-check-area');
    checkArea.append(check);
    const body = element('div', 'ad-gallery-body');
    const title = element('h3', 'ad-gallery-title'),
      detail = element('p', 'ad-gallery-detail');
    const labels = element('div', 'ad-gallery-labels'),
      actions = element('div', 'ad-gallery-actions');
    body.append(title, detail, labels);
    node.append(button, checkArea, body, actions);
    const card: Card = {
      node,
      button,
      image,
      text,
      status,
      check,
      checkArea,
      title,
      detail,
      labels,
      actions,
      item,
      visible: false,
      edge: 0,
      requested: 0,
      generation: 0,
      loading: false,
    };
    button.onclick = (event) =>
      options.clickSelect
        ? options.clickSelect(card.item.id, event)
        : model.selection === 'single'
          ? options.select(card.item.id, true)
          : options.activate(card.item.id);
    if (options.clickSelect) button.ondblclick = () => options.activate(card.item.id);
    if (options.context) {
      node.oncontextmenu = (event) => {
        event.preventDefault();
        options.context!(card.item.id, event, button);
      };
      node.onkeydown = (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          options.context!(card.item.id, event, document.activeElement as HTMLElement);
        }
      };
    }
    check.onchange = () => options.select(card.item.id, check.checked);
    observer.observe(node);
    return card;
  };
  return {
    anchor,
    restore,
    cancelInteraction: () => interactions?.cancel(),
    setModel(next: GalleryModel) {
      if (disposed) return;
      const saved = anchor();
      const previousOrder = [...container.children]
        .map((child) => (child as HTMLElement).dataset.imageId)
        .filter((id): id is string => !!id);
      model = next;
      container.style.setProperty(
        '--ad-gallery-width',
        `${validGalleryWidth(next.cardWidth, options.size) ? next.cardWidth : gallerySize.initial}px`,
      );
      container.dataset.fit = next.fit;
      container.dataset.compact = String(next.cardWidth < 180);
      container.dataset.icons = String(!!options.clickSelect && next.cardWidth < 120);
      const ids = new Set(next.items.map((i) => i.id));
      for (const [id, card] of cards)
        if (!ids.has(id)) {
          card.generation++;
          observer.unobserve(card.node);
          card.node.remove();
          cards.delete(id);
        }
      next.items.forEach((item, index) => {
        const card = cards.get(item.id) ?? create(item);
        cards.set(item.id, card);
        if (card.item.assetId !== item.assetId) {
          card.generation++;
          card.edge = 0;
          card.requested = 0;
        }
        card.item = item;
        const isText = item.textPreview !== undefined;
        card.image.hidden = isText;
        card.text.hidden = !isText || item.state !== 'ready';
        card.text.textContent = item.textPreview ?? '';
        card.node.dataset.text = String(isText);
        if (item.state !== 'ready') card.status.dataset.state = item.state;
        card.node.classList.toggle('ad-gallery-selected', !!item.selected);
        card.check.hidden = next.selection !== 'multiple';
        card.checkArea.hidden = next.selection !== 'multiple';
        card.check.checked = !!item.selected;
        card.check.disabled = item.selectable === false;
        card.check.setAttribute('aria-label', hostText('gallery.select', { title: item.title }));
        card.button.setAttribute(
          'aria-label',
          hostText(
            next.selection === 'single' || options.clickSelect
              ? 'gallery.select'
              : 'gallery.enlarge',
            { title: item.title },
          ),
        );
        if (next.selection === 'single' || options.clickSelect)
          card.button.setAttribute('aria-pressed', String(!!item.selected));
        else card.button.removeAttribute('aria-pressed');
        card.button.disabled =
          item.selectable === false ||
          (!options.clickSelect && next.selection !== 'single' && item.state !== 'ready');
        card.node.title = item.description ?? item.title;
        card.title.textContent = item.title;
        card.title.title = item.title;
        card.detail.textContent = item.detail;
        const tags = options.expandLabels ? item.labels : item.labels.slice(0, 2);
        if (!options.expandLabels && item.labels.length > 2)
          tags.push(hostText('gallery.moreLabels', { count: item.labels.length - 2 }));
        if (card.labels.dataset.signature !== JSON.stringify(tags)) {
          card.labels.replaceChildren(
            ...tags.map((v) => {
              const label = element('span', 'ad-gallery-tag', v);
              label.title = v;
              return label;
            }),
          );
          card.labels.dataset.signature = JSON.stringify(tags);
        }
        if (item.state === 'error' || item.state === 'missing') {
          card.generation++;
          card.image.removeAttribute('src');
          card.edge = 0;
          card.requested = 0;
        }
        if (item.state !== 'ready')
          card.status.textContent = {
            missing: hostText('gallery.missing'),
            error: options.errorText ?? hostText('gallery.readFailed'),
            loading: hostText('gallery.loading'),
          }[item.state];
        else if (card.edge || isText) card.status.textContent = '';
        else if (card.status.dataset.state === 'error')
          card.status.textContent = options.errorText ?? hostText('gallery.readFailed');
        else if (card.loading) card.status.textContent = hostText('gallery.loading');
        for (const old of [...card.actions.children])
          if (!item.actions.some((a) => a.id === (old as HTMLElement).dataset.action)) old.remove();
        item.actions.forEach((action) => {
          let control = [...card.actions.querySelectorAll('button')].find(
            (b) => b.dataset.action === action.id,
          );
          if (!control) {
            control = element('button', 'ad-gallery-action');
            control.type = 'button';
            control.dataset.action = action.id;
            control.onclick = () => options.action(card.item.id, action.id);
            card.actions.append(control);
          }
          control.textContent = action.title;
          control.setAttribute('aria-label', action.title);
          control.title = action.title;
          control.disabled = !!action.disabled;
        });
        // Avoid moving already ordered DOM nodes (moving the focused node loses focus).
        if (container.children[index] !== card.node)
          container.insertBefore(card.node, container.children[index] ?? null);
      });
      empty.textContent = next.empty;
      if (!next.items.length) container.append(empty);
      else empty.remove();
      if (saved && !cards.has(saved.id)) {
        const index = previousOrder.indexOf(saved.id);
        const replacement =
          previousOrder.slice(index + 1).find((id) => cards.has(id)) ??
          previousOrder
            .slice(0, index)
            .reverse()
            .find((id) => cards.has(id));
        if (replacement) saved.id = replacement;
      }
      restore(saved);
      interactions?.update();
      pump();
    },
    dispose() {
      disposed = true;
      interactions?.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      for (const card of cards.values()) card.generation++;
      cards.clear();
      container.replaceChildren();
      container.classList.remove('ad-gallery');
    },
  };
}
export function mountGallerySizeControl(
  container: HTMLElement,
  options: {
    label?: string;
    range?: GallerySize;
    value: number;
    change(value: number): void;
    commit(value: number): void;
  },
) {
  const label = element('label', 'ad-gallery-size', options.label ?? hostText('gallery.size'));
  const small = element('span', '', hostText('gallery.small')),
    large = element('span', '', hostText('gallery.large'));
  const input = element('input', '');
  input.type = 'range';
  const range = options.range ?? gallerySize;
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = String(range.step);
  input.setAttribute('aria-label', options.label ?? hostText('gallery.size'));
  let committed = options.value;
  const setValue = (value: number) => {
    input.value = String(value);
    input.setAttribute(
      'aria-valuetext',
      hostText(
        value === gallerySize.initial
          ? 'gallery.sizeDefault'
          : value < gallerySize.initial
            ? 'gallery.sizeSmaller'
            : 'gallery.sizeLarger',
        { value },
      ),
    );
  };
  const commit = () => {
    const value = Number(input.value);
    if (committed !== value) {
      committed = value;
      options.commit(value);
    }
  };
  input.oninput = () => {
    setValue(Number(input.value));
    options.change(Number(input.value));
  };
  input.onchange = () => {
    if (!dragging && !keyDown) commit();
  };
  let dragging = false,
    keyDown = false;
  input.onpointerdown = () => {
    dragging = true;
  };
  const pointerEnd = () => {
    if (dragging) {
      dragging = false;
      commit();
    }
  };
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  input.onkeydown = (e) => {
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(e.key)
    )
      keyDown = true;
  };
  input.onkeyup = () => {
    keyDown = false;
    commit();
  };
  input.onblur = () => {
    dragging = false;
    keyDown = false;
    commit();
  };
  setValue(options.value);
  label.append(small, input, large);
  container.append(label);
  return {
    setValue(value: number) {
      label.firstChild!.textContent = options.label ?? hostText('gallery.size');
      small.textContent = hostText('gallery.small');
      large.textContent = hostText('gallery.large');
      input.setAttribute('aria-label', options.label ?? hostText('gallery.size'));
      if (!dragging && !keyDown) {
        committed = value;
        setValue(value);
      } else setValue(Number(input.value));
    },
    dispose() {
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      label.remove();
    },
  };
}

export interface GalleryPreviewModel {
  assetId: string;
  title: string;
  detail: string;
  labels: string[];
  state: GalleryItem['state'];
}
/** Preview content only: the adapter owns the dialog, source authorization and focus. */
export function mountGalleryPreview(
  container: HTMLElement,
  options: { image(assetId: string): Promise<string> },
) {
  container.classList.add('ad-gallery-preview');
  const stage = element('div', 'ad-gallery-preview-stage');
  const picture = element('img', '');
  const status = element('p', 'ad-gallery-preview-status');
  status.setAttribute('role', 'status');
  const detail = element('p', 'ad-gallery-preview-detail');
  const labels = element('p', 'ad-gallery-preview-labels');
  stage.append(picture, status);
  container.append(stage, detail, labels);
  let sequence = 0,
    previous = '',
    disposed = false;
  let statusKey: 'gallery.empty' | 'gallery.readFailed' | 'gallery.loading' | undefined;
  return {
    setModel(model: GalleryPreviewModel) {
      picture.alt = model.title;
      detail.textContent = model.detail;
      labels.textContent = model.labels.join(' / ');
      if (statusKey) status.textContent = hostText(statusKey);
      const key = `${model.assetId}:${model.state}`;
      if (key === previous || disposed) return;
      previous = key;
      const current = ++sequence;
      picture.removeAttribute('src');
      statusKey =
        model.state === 'missing'
          ? 'gallery.empty'
          : model.state === 'error'
            ? 'gallery.readFailed'
            : 'gallery.loading';
      status.textContent = hostText(statusKey);
      if (model.state !== 'ready') return;
      void options
        .image(model.assetId)
        .then(async (source) => {
          if (!safeImage(source)) throw Error('Unsupported image URL');
          const decoded = new Image();
          decoded.src = source;
          await decoded.decode();
          if (disposed || current !== sequence) return;
          picture.src = source;
          statusKey = undefined;
          status.textContent = '';
        })
        .catch(() => {
          if (!disposed && current === sequence) {
            statusKey = 'gallery.readFailed';
            status.textContent = hostText(statusKey);
          }
        });
    },
    dispose() {
      disposed = true;
      sequence++;
      picture.removeAttribute('src');
      container.replaceChildren();
      container.classList.remove('ad-gallery-preview');
    },
  };
}
