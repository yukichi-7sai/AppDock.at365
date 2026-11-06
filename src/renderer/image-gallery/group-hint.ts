import { hostText } from '../../shared/i18n';
import { openHintPopover } from '../settings-ui/hint-popover';
import '../settings-ui/settings-hint-icon.css';

let nextId = 0;

/** One lazy, plain-text help popover per gallery, including unabridged membership names. */
export function mountGalleryGroupHint(
  container: HTMLElement,
  labels: (anchor: HTMLElement) => string[],
  enabled: () => boolean,
) {
  const popup = document.createElement('div');
  popup.id = `gallery-group-hint-${++nextId}`;
  popup.className = 'settings-hint-tooltip ad-gallery-group-popover';
  popup.popover = 'manual';
  popup.setAttribute('role', 'tooltip');
  popup.tabIndex = -1;
  popup.title = '';
  let anchor: HTMLElement | undefined;
  let signature = '',
    cleanup: (() => void) | undefined;
  let timer: number | undefined,
    pressing = false,
    suppressFocus = false;
  const close = () => {
    window.clearTimeout(timer);
    cleanup?.();
    cleanup = undefined;
    anchor?.removeAttribute('aria-describedby');
    anchor = undefined;
  };
  const show = (next: HTMLElement) => {
    window.clearTimeout(timer);
    if (suppressFocus || pressing || !enabled()) return;
    const groups = labels(next);
    if (!groups.length) return;
    const value = JSON.stringify(groups);
    if (anchor === next && signature === value) return;
    close();
    anchor = next;
    signature = value;
    const title = document.createElement('strong');
    title.textContent = hostText('gallery.groupMemberships', { count: groups.length });
    const list = document.createElement('ul');
    for (const name of groups) {
      const item = document.createElement('li');
      item.textContent = name;
      list.append(item);
    }
    popup.replaceChildren(title, list);
    if (!popup.isConnected) document.body.append(popup);
    next.setAttribute('aria-describedby', popup.id);
    cleanup = openHintPopover(next, popup, close, () => {
      suppressFocus = true;
      next.focus({ preventScroll: true });
      suppressFocus = false;
    });
  };
  const trigger = (target: EventTarget | null) => {
    const node =
      target instanceof Element ? target.closest<HTMLElement>('.ad-gallery-group-hint') : null;
    return node && container.contains(node) ? node : undefined;
  };
  const enter = (event: PointerEvent) => {
    const next = trigger(event.target);
    if (!event.buttons) {
      pressing = false;
      if (next) show(next);
    }
  };
  const leave = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (
        !anchor?.matches(':hover') &&
        !popup.matches(':hover') &&
        document.activeElement !== anchor &&
        !popup.contains(document.activeElement)
      )
        close();
    }, 100);
  };
  const focus = (event: FocusEvent) => {
    const next = trigger(event.target);
    if (next) show(next);
  };
  const blur = (event: FocusEvent) => {
    if (
      !anchor?.contains(event.relatedTarget as Node) &&
      !popup.contains(event.relatedTarget as Node)
    )
      close();
  };
  const click = (event: MouseEvent) => {
    const next = trigger(event.target);
    if (!next) return;
    event.stopPropagation();
    show(next);
  };
  const key = (event: KeyboardEvent) => {
    const next = trigger(event.target);
    if (!next || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229 || event.repeat) return;
    show(next);
    if (anchor === next) popup.focus({ preventScroll: true });
  };
  const down = (event: PointerEvent) => {
    if (popup.contains(event.target as Node)) return;
    pressing = true;
    close();
  };
  const up = () => {
    pressing = false;
  };
  const deactivate = () => {
    pressing = false;
    close();
  };
  container.addEventListener('pointerover', enter);
  container.addEventListener('pointerout', leave);
  container.addEventListener('focusin', focus);
  container.addEventListener('focusout', blur);
  container.addEventListener('click', click);
  container.addEventListener('keydown', key);
  popup.addEventListener('pointerenter', () => window.clearTimeout(timer));
  popup.addEventListener('pointerleave', leave);
  popup.addEventListener('focusout', blur);
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', deactivate);
  return {
    close,
    update() {
      if (
        anchor &&
        (!anchor.isConnected || !enabled() || JSON.stringify(labels(anchor)) !== signature)
      )
        close();
    },
    dispose() {
      close();
      popup.remove();
      container.removeEventListener('pointerover', enter);
      container.removeEventListener('pointerout', leave);
      container.removeEventListener('focusin', focus);
      container.removeEventListener('focusout', blur);
      container.removeEventListener('click', click);
      container.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', deactivate);
    },
  };
}
