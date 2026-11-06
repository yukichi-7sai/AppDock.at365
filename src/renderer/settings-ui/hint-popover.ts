import { settingsPopoverScroll } from './settings-popover-scroll';

/** Shared placement and dismissal for React hints and DOM-owned library labels. */
export function openHintPopover(
  anchor: HTMLElement,
  popup: HTMLElement,
  close: () => void,
  restoreFocus: () => void = () => anchor.focus({ preventScroll: true }),
) {
  popup.style.maxHeight = 'calc(100dvh - 16px)';
  popup.showPopover();
  const rect = anchor.getBoundingClientRect();
  const margin = 8,
    gap = 6;
  const below = window.innerHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const upward = below < popup.getBoundingClientRect().height && above > below;
  popup.style.maxHeight = `${Math.max(0, upward ? above : below)}px`;
  const size = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - size.width - margin))}px`;
  popup.style.top = `${Math.max(margin, upward ? rect.top - gap - size.height : rect.bottom + gap)}px`;
  const outside = (event: PointerEvent) => {
    if (!anchor.contains(event.target as Node) && !popup.contains(event.target as Node)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    const restore = popup.contains(document.activeElement);
    close();
    if (restore) restoreFocus();
  };
  const scroll = settingsPopoverScroll(anchor, popup, close);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape, true);
  window.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', close);
  return () => {
    if (popup.isConnected && popup.matches(':popover-open')) popup.hidePopover();
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape, true);
    window.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', close);
  };
}
