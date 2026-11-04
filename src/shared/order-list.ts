/** Display-only grouping. The caller continues to persist one flat sequence of item IDs. */
export interface OrderListItem {
  id: string;
  title: string;
  description?: string;
  state?: string;
  group?: string;
  displayTitle?: string;
}

export interface OrderListBlock<T extends OrderListItem = OrderListItem> {
  key: string;
  group?: string;
  items: T[];
}

/** Matches the library navigation: only the first ASCII colon defines a parent. */
export function libraryOrderLabel(title: string): { group?: string; displayTitle: string } {
  const colon = title.indexOf(':');
  const group = colon > 0 ? title.slice(0, colon).trim() : '';
  return group ? { group, displayTitle: title.slice(colon + 1).trim() } : { displayTitle: title };
}

export function orderListBlocks<T extends OrderListItem>(items: readonly T[]): OrderListBlock<T>[] {
  const blocks: OrderListBlock<T>[] = [];
  const groups = new Map<string, OrderListBlock<T>>();
  for (const item of items) {
    if (!item.group) {
      blocks.push({ key: JSON.stringify(['item', item.id]), items: [item] });
      continue;
    }
    let block = groups.get(item.group);
    if (!block) {
      block = { key: JSON.stringify(['group', item.group]), group: item.group, items: [] };
      groups.set(item.group, block);
      blocks.push(block);
    }
    block.items.push(item);
  }
  return blocks;
}

export interface OrderListTarget {
  block: string;
  /** Absent for an entire block, including an ungrouped item. */
  item?: string;
}

/** Rejects reparenting. An actual move returns the complete, contiguous display order. */
export function moveOrderList<T extends OrderListItem>(
  blocks: readonly OrderListBlock<T>[],
  source: OrderListTarget,
  target: OrderListTarget,
  after: boolean,
): string[] | undefined {
  if ((source.item === undefined) !== (target.item === undefined)) return;
  if (source.item !== undefined && source.block !== target.block) return;
  const rows =
    source.item === undefined
      ? blocks.map((block) => block.key)
      : blocks.find((block) => block.key === source.block)?.items.map((item) => item.id);
  if (!rows) return;
  const from = rows.indexOf(source.item ?? source.block);
  const targetIndex = rows.indexOf(target.item ?? target.block);
  if (from < 0 || targetIndex < 0) return;
  let to = targetIndex + (after ? 1 : 0);
  if (from < to) to--;
  if (from === to) return;
  const next = [...rows];
  next.splice(to, 0, next.splice(from, 1)[0]);
  if (source.item !== undefined)
    return blocks.flatMap((block) =>
      block.key === source.block ? next : block.items.map((item) => item.id),
    );
  const byKey = new Map(blocks.map((block) => [block.key, block]));
  return next.flatMap((key) => byKey.get(key)!.items.map((item) => item.id));
}

/** Opening, folding, or returning to the initial display order must not normalize stored order. */
export function orderListResult(
  original: readonly OrderListItem[],
  current: readonly OrderListItem[],
): string[] {
  const initialDisplay = orderListBlocks(original).flatMap((block) =>
    block.items.map((item) => item.id),
  );
  const display = orderListBlocks(current).flatMap((block) => block.items.map((item) => item.id));
  return display.length === initialDisplay.length &&
    display.every((id, index) => id === initialDisplay[index])
    ? original.map((item) => item.id)
    : display;
}
