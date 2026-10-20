export type RibbonPlacement = 'top' | 'bottom';
export interface AppletRibbonItem {
  id: string;
  title: string;
  action: 'settings';
  icon?: RibbonBuiltinIcon;
  imageSetting?: string;
  imageShape?: 'square' | 'circle';
  iconOnly?: boolean;
  defaultPlacement?: RibbonPlacement;
}
export const ribbonGroupIcons = [
  'folder',
  'mail',
  'clock',
  'image',
  'extensions',
  'settings',
  'bell',
  'user',
] as const;
export type RibbonBuiltinIcon = (typeof ribbonGroupIcons)[number];
export const defaultRibbonRightClickCommand = 'appdock.ribbon.settings.open';
export interface RibbonCommandButton {
  image?: import('./registered-images').RegisteredImageRef | null;
  id: string;
  title: string;
  icon: RibbonBuiltinIcon;
  commandId: string;
  iconOnly?: boolean;
}
export interface RibbonGroup {
  image?: import('./registered-images').RegisteredImageRef | null;
  id: string;
  title: string;
  icon: (typeof ribbonGroupIcons)[number];
  expansion: 'persistent' | 'temporary';
  iconOnly?: boolean;
  color?: string | null;
  children: string[];
}
export interface RibbonItemOverride {
  image?: import('./registered-images').RegisteredImageRef | null;
  placement?: RibbonPlacement;
  title?: string;
  iconOnly?: boolean;
  /** Registration name remembered when saving a ribbon edit; used only if the source disappears. */
  lastKnownTitle?: string;
}
export interface RibbonLayout {
  order: string[];
  hidden: string[];
  bottom: string[];
  separators: string[];
  groups?: RibbonGroup[];
  itemOverrides?: Record<string, RibbonItemOverride>;
  separatorTitles?: Record<string, string>;
  buttons?: RibbonCommandButton[];
  rightClickCommand?: string;
}
export function parseRibbonColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value))
    throw Error('色は #RRGGBB または色なしで指定してください。');
  return value.toUpperCase();
}
export type RibbonBadgeTarget = { pageId: string } | { collectionKey: string; itemId: string };
export type RibbonBadge =
  { kind: 'count'; count: number; label?: string } | { kind: 'dot'; label?: string } | null;
export type RibbonBadgeView = { kind: 'count' | 'dot'; text: string; description: string };
export type RibbonAnchor = { x: number; y: number; width: number; height: number };

export function parseRibbonBadge(value: unknown): RibbonBadge {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('バッジの形式が不正です。');
  const v = value as Record<string, unknown>;
  if (
    !['count', 'dot'].includes(v.kind as string) ||
    Object.keys(v).some(
      (k) => !['kind', 'label', ...(v.kind === 'count' ? ['count'] : [])].includes(k),
    ) ||
    (v.label !== undefined &&
      (typeof v.label !== 'string' ||
        !v.label.trim() ||
        v.label.trim().length > 120 ||
        /[\x00-\x1f\x7f]/.test(v.label))) ||
    (v.kind === 'count' && (!Number.isSafeInteger(v.count) || (v.count as number) < 0))
  )
    throw Error('バッジは0以上の整数または点と、120文字以下の説明で指定してください。');
  if (v.kind === 'count' && v.count === 0) return null;
  return {
    kind: v.kind,
    ...(v.kind === 'count' ? { count: v.count } : {}),
    ...(v.label ? { label: (v.label as string).trim() } : {}),
  } as RibbonBadge;
}
export function ribbonBadgeView(badge: RibbonBadge): RibbonBadgeView | undefined {
  if (!badge) return;
  return badge.kind === 'count'
    ? {
        kind: 'count',
        text: badge.count > 99 ? '99+' : String(badge.count),
        description: `${badge.label ?? '件数'}: ${badge.count}`,
      }
    : { kind: 'dot', text: '', description: badge.label ?? '新しい情報があります' };
}
