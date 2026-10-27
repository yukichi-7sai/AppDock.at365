/** Shared visual order for the key picker and trigger lists. */
export const shortcutAlphanumericKeys = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
export const shortcutModifierKeys = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;
export const shortcutSpecialKeyGroups = [
  [
    'operation',
    [
      'Tab',
      'Enter',
      'Escape',
      'Space',
      'Backspace',
      'Delete',
      'Insert',
      'Pause',
      'CapsLock',
      'ScrollLock',
      'Alphanumeric',
      'KanaMode',
      'Convert',
      'NonConvert',
      'Plus',
    ],
  ],
  ['navigation', ['Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown']],
  ['function', Array.from({ length: 24 }, (_, i) => `F${i + 1}`)],
] as const;

const keyOrder = new Map<string, number>(
  [...shortcutAlphanumericKeys, ...shortcutSpecialKeyGroups.flatMap(([, keys]) => keys)].map(
    (key, index) => [key, index],
  ),
);
export function compareShortcutDisplayOrder(a: string, b: string): number {
  const partsA = a.split('+'),
    partsB = b.split('+');
  const keyA = partsA.pop() ?? '',
    keyB = partsB.pop() ?? '';
  const order = (keyOrder.get(keyA) ?? keyOrder.size) - (keyOrder.get(keyB) ?? keyOrder.size);
  if (order) return order;
  if (keyA !== keyB) return keyA.localeCompare(keyB, 'en', { numeric: true });
  // Plain key first, then modifier combinations in the picker's Ctrl/Alt/Shift/Win order.
  const modifiers = (parts: string[]) =>
    shortcutModifierKeys
      .flatMap((modifier, index) => (parts.includes(modifier) ? [index] : []))
      .join('');
  return modifiers(partsA).localeCompare(modifiers(partsB), 'en');
}
