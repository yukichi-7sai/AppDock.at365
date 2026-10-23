import { hostText } from './i18n';
import {
  orderRibbon,
  parseRibbon,
  validGroupId,
  validRibbonId,
  validSeparatorId,
  validRibbonButtonId,
  defaultRibbon,
  type RibbonItem,
} from './applet-pages';
import type { RibbonLayout, RibbonPlacement, RibbonGroup } from './ribbon';

export class RibbonLayoutError extends Error {
  constructor(
    readonly code: 'INVALID_ARGUMENT' | 'NOT_FOUND',
    message = hostText('services.sharedRibbonLayout.invalidArguments'),
  ) {
    super(message);
  }
}
const invalid = (): never => {
  throw new RibbonLayoutError('INVALID_ARGUMENT');
};
const exact = (v: unknown, keys: string[]): v is Record<string, any> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => keys.includes(k));
export const ribbonParent = (layout: RibbonLayout, id: string) =>
  (layout.groups ?? []).find((g) => g.children.includes(id));
export const ribbonPlacement = (
  layout: RibbonLayout,
  id: string,
  items: RibbonItem[] = [],
): RibbonPlacement => {
  const root = ribbonParent(layout, id)?.id ?? id;
  return (
    layout.itemOverrides?.[root]?.placement ??
    (layout.bottom.includes(root)
      ? 'bottom'
      : (items.find((i) => i.id === root)?.contribution?.defaultPlacement ?? 'top'))
  );
};
export const ribbonVisible = (layout: RibbonLayout, id: string) =>
  !layout.hidden.includes(id) && !layout.hidden.includes(ribbonParent(layout, id)?.id ?? id);
export function ribbonPresentation(layout: RibbonLayout, item: RibbonItem) {
  const override = layout.itemOverrides?.[item.id];
  return {
    title: item.group
      ? item.group.title || hostText('services.sharedRibbonLayout.group')
      : item.kind === 'separator'
        ? layout.separatorTitles?.[item.id] || item.title
        : item.command?.title || override?.title || item.title,
    iconOnly: item.group
      ? !!item.group.iconOnly || !item.group.title
      : (item.command?.iconOnly ?? override?.iconOnly ?? item.contribution?.iconOnly ?? false),
  };
}
export const ribbonRoots = (layout: RibbonLayout, items: RibbonItem[]) =>
  orderRibbon(items, layout.order).filter((i) => !ribbonParent(layout, i.id));
/** Includes retained IDs at their saved positions, then newly discovered root items. */
export function ribbonRootIds(layout: RibbonLayout, items: RibbonItem[]) {
  return [
    ...layout.order,
    ...ribbonRoots(layout, items)
      .map((i) => i.id)
      .filter((id) => !layout.order.includes(id)),
  ];
}
export function ribbonRetainedIds(layout: RibbonLayout, items: RibbonItem[]) {
  const known = new Set([...items.map((i) => i.id), ...(layout.buttons ?? []).map((b) => b.id)]);
  return [
    ...new Set([
      ...layout.order,
      ...layout.hidden,
      ...layout.bottom,
      ...(layout.groups ?? []).flatMap((g) => g.children),
      ...Object.keys(layout.itemOverrides ?? {}),
    ]),
  ].filter((id) => !known.has(id));
}
/** Both the settings renderer and external edits use these ownership/order rules. */
export function editRibbon(
  layout: RibbonLayout,
  items: RibbonItem[],
  operation: unknown,
): RibbonLayout {
  if (
    !exact(operation, [
      'kind',
      'id',
      'changes',
      'placement',
      'ids',
      'title',
      'icon',
      'expansion',
      'parentId',
      'beforeId',
      'iconOnly',
      'color',
      'image',
      'commandId',
    ])
  )
    invalid();
  const op = operation as Record<string, any>;
  const next = structuredClone(layout);
  next.groups ??= [];
  const roots = () => ribbonRootIds(next, items);
  const group = (id: unknown): RibbonGroup => {
    const g = next.groups!.find((g) => g.id === id);
    if (!g)
      throw new RibbonLayoutError(
        'NOT_FOUND',
        hostText('services.sharedRibbonLayout.groupMissing'),
      );
    return g;
  };
  const known = (id: unknown, retained = false) => {
    if (!validRibbonId(id)) invalid();
    if (
      !items.some((i) => i.id === id) &&
      !next.groups!.some((g) => g.id === id) &&
      !(next.buttons ?? []).some((b) => b.id === id) &&
      !(retained && ribbonRetainedIds(next, items).includes(id as string))
    )
      throw new RibbonLayoutError(
        'NOT_FOUND',
        hostText('services.sharedRibbonLayout.unregisteredItem'),
      );
  };
  const placement = (v: unknown): RibbonPlacement => {
    if (v !== 'top' && v !== 'bottom') invalid();
    return v as RibbonPlacement;
  };
  const setPlacement = (id: string, p: RibbonPlacement) => {
    if (items.find((item) => item.id === id)?.contribution) {
      next.itemOverrides = {
        ...next.itemOverrides,
        [id]: { ...next.itemOverrides?.[id], placement: p },
      };
      next.bottom = next.bottom.filter((x) => x !== id);
      return;
    }
    next.bottom = [...next.bottom.filter((x) => x !== id), ...(p === 'bottom' ? [id] : [])];
  };
  const remove = (id: string) => {
    next.order = roots().filter((x) => x !== id);
    for (const g of next.groups!) g.children = g.children.filter((x) => x !== id);
    next.bottom = next.bottom.filter((x) => x !== id);
  };
  if (op.kind === 'update') {
    if (
      !exact(op, ['kind', 'id', 'changes']) ||
      !exact(op.changes, ['visible', 'placement']) ||
      !Object.keys(op.changes).length
    )
      invalid();
    known(op.id);
    const c = op.changes;
    if (c.visible !== undefined) {
      if (typeof c.visible !== 'boolean') invalid();
      if (c.visible === next.hidden.includes(op.id))
        next.hidden = [...next.hidden.filter((x) => x !== op.id), ...(!c.visible ? [op.id] : [])];
    }
    if (c.placement !== undefined) {
      const p = placement(c.placement);
      if (ribbonParent(next, op.id)) invalid();
      if (ribbonPlacement(next, op.id, items) !== p) {
        next.order = [...roots().filter((x) => x !== op.id), op.id];
        setPlacement(op.id, p);
      }
    }
  } else if (op.kind === 'updateItem') {
    if (
      !exact(op, ['kind', 'id', 'changes']) ||
      !exact(op.changes, ['title', 'iconOnly', 'image']) ||
      !Object.keys(op.changes).length ||
      validGroupId(op.id) ||
      validRibbonButtonId(op.id) ||
      validSeparatorId(op.id)
    )
      invalid();
    known(op.id, true);
    next.itemOverrides = {
      ...next.itemOverrides,
      [op.id]: { ...next.itemOverrides?.[op.id], ...op.changes },
    };
  } else if (op.kind === 'removeMissing') {
    if (
      !exact(op, ['kind', 'id']) ||
      items.some((item) => item.id === op.id) ||
      validGroupId(op.id) ||
      validRibbonButtonId(op.id) ||
      validSeparatorId(op.id)
    )
      invalid();
    known(op.id, true);
    next.order = next.order.filter((id) => id !== op.id);
    next.hidden = next.hidden.filter((id) => id !== op.id);
    next.bottom = next.bottom.filter((id) => id !== op.id);
    for (const g of next.groups) g.children = g.children.filter((id) => id !== op.id);
    if (next.itemOverrides) delete next.itemOverrides[op.id];
  } else if (op.kind === 'reorder' || op.kind === 'reorderChildren') {
    const child = op.kind === 'reorderChildren';
    if (
      !exact(op, child ? ['kind', 'id', 'ids'] : ['kind', 'placement', 'ids']) ||
      !Array.isArray(op.ids) ||
      op.ids.length > 550 ||
      op.ids.some((id: unknown) => !validRibbonId(id)) ||
      new Set(op.ids).size !== op.ids.length
    )
      invalid();
    const p = child ? undefined : placement(op.placement);
    const g = child ? group(op.id) : undefined;
    const ids = g
      ? g.children
      : ribbonRoots(next, items)
          .filter((i) => ribbonPlacement(next, i.id, items) === p)
          .map((i) => i.id);
    if (ids.length !== op.ids.length || op.ids.some((id: string) => !ids.includes(id))) invalid();
    if (ids.some((id, index) => op.ids[index] !== id)) {
      if (g) g.children = [...op.ids];
      else {
        let index = 0;
        next.order = roots().map((id) => (ids.includes(id) ? op.ids[index++] : id));
      }
    }
  } else if (op.kind === 'addSeparator') {
    if (
      !exact(op, ['kind', 'id', 'placement']) ||
      !validSeparatorId(op.id) ||
      next.separators.includes(op.id)
    )
      invalid();
    const p = placement(op.placement);
    next.order = [...roots(), op.id];
    next.separators.push(op.id);
    setPlacement(op.id, p);
  } else if (op.kind === 'removeSeparator') {
    if (!exact(op, ['kind', 'id']) || !validSeparatorId(op.id)) invalid();
    if (!next.separators.includes(op.id))
      throw new RibbonLayoutError(
        'NOT_FOUND',
        hostText('services.sharedRibbonLayout.separatorMissing'),
      );
    remove(op.id);
    next.separators = next.separators.filter((id) => id !== op.id);
    next.hidden = next.hidden.filter((id) => id !== op.id);
    if (next.separatorTitles) delete next.separatorTitles[op.id];
  } else if (op.kind === 'updateSeparator') {
    if (
      !exact(op, ['kind', 'id', 'changes']) ||
      !exact(op.changes, ['title']) ||
      typeof op.changes.title !== 'string' ||
      !next.separators.includes(op.id)
    )
      invalid();
    next.separatorTitles = { ...next.separatorTitles, [op.id]: op.changes.title };
  } else if (op.kind === 'addGroup') {
    if (
      !exact(op, [
        'kind',
        'id',
        'title',
        'icon',
        'expansion',
        'placement',
        'iconOnly',
        'color',
        'image',
      ]) ||
      !validGroupId(op.id) ||
      next.groups.some((g) => g.id === op.id)
    )
      invalid();
    const p = placement(op.placement);
    next.order = [...roots(), op.id];
    next.groups.push({
      id: op.id,
      title: op.title,
      icon: op.icon,
      expansion: op.expansion,
      children: [],
      ...(op.iconOnly !== undefined ? { iconOnly: op.iconOnly } : {}),
      ...(op.color !== undefined ? { color: op.color } : {}),
      ...(op.image !== undefined ? { image: op.image } : {}),
    });
    setPlacement(op.id, p);
  } else if (op.kind === 'updateGroup') {
    if (
      !exact(op, ['kind', 'id', 'changes']) ||
      !exact(op.changes, ['title', 'icon', 'expansion', 'iconOnly', 'color', 'image']) ||
      !Object.keys(op.changes).length
    )
      invalid();
    Object.assign(group(op.id), op.changes);
  } else if (op.kind === 'addButton') {
    if (
      !exact(op, ['kind', 'id', 'title', 'icon', 'commandId', 'iconOnly', 'placement', 'image']) ||
      !validRibbonButtonId(op.id) ||
      (next.buttons ?? []).some((b) => b.id === op.id)
    )
      invalid();
    const p = placement(op.placement);
    next.buttons = [
      ...(next.buttons ?? []),
      {
        id: op.id,
        title: op.title,
        icon: op.icon,
        commandId: op.commandId,
        ...(op.image !== undefined ? { image: op.image } : {}),
        ...(op.iconOnly !== undefined ? { iconOnly: op.iconOnly } : {}),
      },
    ];
    next.order = [...roots(), op.id];
    setPlacement(op.id, p);
  } else if (op.kind === 'updateButton') {
    if (
      !exact(op, ['kind', 'id', 'changes']) ||
      !exact(op.changes, ['title', 'icon', 'commandId', 'iconOnly', 'image']) ||
      !Object.keys(op.changes).length
    )
      invalid();
    const button = next.buttons?.find((b) => b.id === op.id);
    if (!button)
      throw new RibbonLayoutError(
        'NOT_FOUND',
        hostText('services.sharedRibbonLayout.buttonMissing'),
      );
    Object.assign(button, op.changes);
  } else if (op.kind === 'removeButton') {
    if (!exact(op, ['kind', 'id']) || !next.buttons?.some((b) => b.id === op.id)) invalid();
    remove(op.id);
    next.buttons = (next.buttons ?? []).filter((b) => b.id !== op.id);
    next.hidden = next.hidden.filter((id) => id !== op.id);
  } else if (op.kind === 'setRightClickCommand') {
    if (!exact(op, ['kind', 'commandId'])) invalid();
    next.rightClickCommand = op.commandId;
  } else if (op.kind === 'moveItem') {
    if (
      !exact(op, ['kind', 'id', 'parentId', 'beforeId', 'placement']) ||
      (op.parentId !== null && !validGroupId(op.parentId)) ||
      (op.beforeId !== null && !validRibbonId(op.beforeId)) ||
      op.id === op.beforeId
    )
      invalid();
    known(op.id, true);
    const destination = op.parentId === null ? undefined : group(op.parentId);
    if (destination && (validGroupId(op.id) || op.placement !== undefined)) invalid();
    const p = destination ? ribbonPlacement(next, destination.id, items) : placement(op.placement);
    const before = destination ? destination.children : roots();
    if (
      op.beforeId !== null &&
      (!before.includes(op.beforeId) ||
        (!destination && ribbonPlacement(next, op.beforeId, items) !== p))
    )
      invalid();
    const sameParent = (ribbonParent(next, op.id)?.id ?? null) === op.parentId;
    const siblings = destination
      ? before
      : before.filter((id) => ribbonPlacement(next, id, items) === p);
    const desired = siblings.filter((id) => id !== op.id);
    desired.splice(op.beforeId === null ? desired.length : desired.indexOf(op.beforeId), 0, op.id);
    if (
      sameParent &&
      ribbonPlacement(next, op.id, items) === p &&
      JSON.stringify(desired) === JSON.stringify(siblings)
    )
      return next;
    remove(op.id);
    const ids = destination ? destination.children : next.order;
    ids.splice(op.beforeId === null ? ids.length : ids.indexOf(op.beforeId), 0, op.id);
    if (!destination) setPlacement(op.id, p);
  } else if (op.kind === 'ungroup') {
    if (!exact(op, ['kind', 'id'])) invalid();
    const g = group(op.id),
      p = ribbonPlacement(next, g.id, items),
      hidden = next.hidden.includes(g.id);
    next.order = roots().flatMap((id) => (id === g.id ? g.children : [id]));
    next.groups = next.groups.filter((v) => v.id !== g.id);
    next.bottom = next.bottom.filter((id) => id !== g.id);
    next.hidden = next.hidden.filter((id) => id !== g.id);
    for (const id of g.children) {
      setPlacement(id, p);
      if (hidden && !next.hidden.includes(id)) next.hidden.push(id);
    }
  } else if (op.kind === 'reset') {
    if (!exact(op, ['kind'])) invalid();
    return {
      ...defaultRibbon(),
      ...(layout.rightClickCommand !== undefined
        ? { rightClickCommand: layout.rightClickCommand }
        : {}),
    };
  } else invalid();
  // Keep names for configured Applet pages without pinning a live source's display name.
  // Reads and no-op edits do not write metadata; explicit removal only removes its target.
  if (op.kind !== 'removeMissing' && JSON.stringify(next) !== JSON.stringify(layout)) {
    const retained = new Set(ribbonRetainedIds(next, []));
    for (const item of items) {
      if (!item.extensionId || !retained.has(item.id)) continue;
      const lastKnownTitle = item.title
        .replace(/[\x00-\x1f\x7f]/g, '')
        .trim()
        .slice(0, 80);
      if (!lastKnownTitle) continue;
      next.itemOverrides ??= {};
      if (!next.itemOverrides[item.id] && Object.keys(next.itemOverrides).length >= 500) continue;
      next.itemOverrides[item.id] = { ...next.itemOverrides[item.id], lastKnownTitle };
    }
  }
  try {
    return parseRibbon(next);
  } catch (e) {
    throw new RibbonLayoutError('INVALID_ARGUMENT', String((e as Error).message));
  }
}
