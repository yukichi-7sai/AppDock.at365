/** Ignore scroll events already queued by focusing an offscreen trigger. */
export function settingsPopoverScroll(
  anchor: HTMLElement,
  popup: HTMLElement,
  dismiss: () => void,
) {
  const positions = new Map<Element, [number, number]>();
  for (let element: Element | null = anchor.parentElement; element; element = element.parentElement)
    positions.set(element, [element.scrollTop, element.scrollLeft]);
  return (event: Event) => {
    if (popup.contains(event.target as Node)) return;
    const element =
      event.target instanceof Document
        ? event.target.scrollingElement
        : event.target instanceof Element
          ? event.target
          : null;
    const before = element && positions.get(element);
    if (before && element!.scrollTop === before[0] && element!.scrollLeft === before[1]) return;
    dismiss();
  };
}
