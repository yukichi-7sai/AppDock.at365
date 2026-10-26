import { hostText } from './i18n';
import type { ExtensionManifest, ExtensionSnapshot, Settings } from './contracts';
import { validCommandId } from './commands';
import { imageReference, type RegisteredImageRef } from './registered-images';
import {
  ribbonGroupIcons,
  parseRibbonColor,
  parseRibbonDisplayModeIcons,
  type RibbonGroup,
  type RibbonItemOverride,
  type RibbonCommandButton,
  type RibbonPlacement,
} from './ribbon';

export type PageDisplay = 'page' | 'window';
export interface AppletPageDefinition {
  image?: RegisteredImageRef | null;
  iconImage?: string;
  id: string;
  title: string;
  icon?: 'mail' | 'clock' | 'image' | 'folder' | 'extensions';
  source: 'local' | 'web-accounts';
  ui?: string;
  openCommand: string;
  defaultDisplay?: PageDisplay;
}
export interface RibbonItem {
  defaultPlacement?: RibbonPlacement;
  image?: RegisteredImageRef | null;
  contribution?: import('./ribbon').AppletRibbonItem;
  iconImage?: string;
  kind?: 'separator' | 'group' | 'command';
  group?: RibbonGroup;
  command?: RibbonCommandButton;
  id: string;
  title: string;
  icon: string;
  extensionId?: string;
  pageId?: string;
}
export const builtinRibbon: RibbonItem[] = [
  { id: 'image-library', title: hostText('settings.applet-pages.images'), icon: 'image' },
  { id: 'settings', title: hostText('settings.applet-pages.settings'), icon: 'settings' },
  { id: 'logs', title: hostText('settings.applet-pages.logs'), icon: 'logs' },
  { id: 'notifications', title: hostText('settings.applet-pages.notifications'), icon: 'bell' },
  { id: 'theme', title: hostText('settings.applet-pages.theme'), icon: 'sun' },
  {
    id: 'ribbon-display-mode',
    title: hostText('settings.applet-pages.ribbonDisplayMode'),
    icon: 'chevron',
    defaultPlacement: 'bottom',
  },
];
export const pageKey = (extensionId: string, pageId: string) => `page:${extensionId}:${pageId}`;
export const validPageId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-z0-9][a-z0-9.-]{0,79}$/.test(id) &&
  !['constructor', 'prototype', '__proto__'].includes(id);
export const validRibbonId = (id: unknown): id is string =>
  typeof id === 'string' &&
  (id === 'extensions' ||
    id === 'home' || // Retain retired layout references without displaying a home item.
    builtinRibbon.some((item) => item.id === id) ||
    id === 'profile' ||
    /^(?:page|applet):[a-z0-9][a-z0-9.-]{0,100}:[a-z0-9][a-z0-9.-]{0,79}$/.test(id) ||
    validSeparatorId(id) ||
    validRibbonButtonId(id) ||
    validGroupId(id));
export const validRibbonButtonId = (id: unknown): id is string =>
  typeof id === 'string' && /^button:[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export const validGroupId = (id: unknown): id is string =>
  typeof id === 'string' && /^group:[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export const validSeparatorId = (id: unknown): id is string =>
  typeof id === 'string' && /^separator:[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export const defaultRibbon = () => ({
  order: [] as string[],
  hidden: [] as string[],
  bottom: ['theme'],
  separators: [] as string[],
  groups: [] as RibbonGroup[],
  itemOverrides: {} as Record<string, RibbonItemOverride>,
  separatorTitles: {} as Record<string, string>,
  buttons: [] as RibbonCommandButton[],
});

export function parseAppletPages(manifest: ExtensionManifest): AppletPageDefinition[] {
  const pages = manifest.pages;
  if (pages === undefined) return [];
  if (!Array.isArray(pages) || pages.length > 10 || !manifest.capabilities?.includes('pages'))
    throw Error(hostText('settings.applet-pages.pageLimit'));
  const ids = new Set<string>();
  let web = false;
  return pages.map((page) => {
    if (
      !page ||
      !validPageId(page.id) ||
      ids.has(page.id) ||
      typeof page.title !== 'string' ||
      !page.title.trim() ||
      page.title.length > 80 ||
      /[\x00-\x1f\x7f]/.test(page.title) ||
      !['local', 'web-accounts'].includes(page.source) ||
      (page.icon !== undefined &&
        !['mail', 'clock', 'image', 'folder', 'extensions'].includes(page.icon)) ||
      (page.defaultDisplay !== undefined && !['page', 'window'].includes(page.defaultDisplay)) ||
      !manifest.commands?.some(
        (command) => command.id === page.openCommand && command.activateOnExecute,
      )
    )
      throw Error(hostText('settings.applet-pages.pageDefinition'));
    if (
      page.source === 'local' &&
      (typeof page.ui !== 'string' || !page.ui || !/\.html$/i.test(page.ui))
    )
      throw Error(hostText('settings.applet-pages.html'));
    if (page.source === 'web-accounts') {
      if (
        web ||
        !manifest.webAccounts ||
        !manifest.capabilities?.includes('web-accounts') ||
        page.ui !== undefined
      )
        throw Error(hostText('settings.applet-pages.webAccountPage'));
      web = true;
    }
    ids.add(page.id);
    return { ...page, title: page.title.trim() };
  });
}
export function ribbonItems(
  extensions: ExtensionManifest[],
  separators: string[] = [],
  groups: RibbonGroup[] = [],
  buttons: RibbonCommandButton[] = [],
): RibbonItem[] {
  const applets = extensions.flatMap((extension) =>
    (extension.pages ?? []).map((page) => ({
      id: pageKey(extension.id, page.id),
      title: page.title,
      icon: page.icon ?? 'extensions',
      iconImage: page.iconImage,
      image: page.image,
      extensionId: extension.id,
      pageId: page.id,
    })),
  );
  return [
    ...builtinRibbon.filter((item) => item.id !== 'theme'),
    ...applets,
    ...extensions.flatMap((extension) =>
      (extension.ribbonItems ?? []).map((contribution) => ({
        id: `applet:${extension.id}:${contribution.id}`,
        title: contribution.title,
        icon: contribution.icon ?? 'extensions',
        extensionId: extension.id,
        contribution,
      })),
    ),
    ...builtinRibbon.filter((item) => item.id === 'theme'),
    ...separators.map((id): RibbonItem => ({
      id,
      title: hostText('settings.applet-pages.separator'),
      icon: '',
      kind: 'separator',
    })),
    ...groups.map((group): RibbonItem => ({
      id: group.id,
      title: group.title || hostText('settings.applet-pages.group'),
      icon: group.icon,
      kind: 'group',
      group,
    })),
    ...buttons.map((command): RibbonItem => ({
      id: command.id,
      title: command.title,
      icon: command.icon,
      kind: 'command',
      command,
    })),
  ];
}
export function visibleRibbonItems(
  extensions: ExtensionSnapshot[],
  separators: string[] = [],
  groups: RibbonGroup[] = [],
  buttons: RibbonCommandButton[] = [],
): RibbonItem[] {
  return ribbonItems(
    extensions.filter((extension) => extension.enabled),
    separators,
    groups,
    buttons,
  );
}
export function orderRibbon(items: RibbonItem[], order: string[]): RibbonItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return [
    ...order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    ...items.filter((item) => !order.includes(item.id)),
  ];
}
export function pageDisplay(
  settings: Settings,
  extensionId: string,
  page: AppletPageDefinition,
): PageDisplay {
  return (
    settings.extensions[extensionId]?.pages?.[page.id]?.display ?? page.defaultDisplay ?? 'page'
  );
}

/** Shared validation for GUI settings saves and external ribbon edits. */
export function parseRibbon(value: unknown): Settings['ribbon'] {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const rawRibbon = value === undefined ? defaultRibbon() : value;
  const ribbon = object(rawRibbon)
    ? {
        ...rawRibbon,
        bottom: rawRibbon.bottom === undefined ? [] : rawRibbon.bottom,
        separators: rawRibbon.separators === undefined ? [] : rawRibbon.separators,
        groups: rawRibbon.groups === undefined ? [] : rawRibbon.groups,
        itemOverrides: rawRibbon.itemOverrides === undefined ? {} : rawRibbon.itemOverrides,
        buttons: rawRibbon.buttons === undefined ? [] : rawRibbon.buttons,
      }
    : rawRibbon;
  if (
    !object(ribbon) ||
    ['order', 'hidden', 'bottom', 'separators'].some((key) => {
      const ids = ribbon[key];
      return (
        !Array.isArray(ids) ||
        ids.length > (key === 'separators' ? 50 : 550) ||
        ids.some((id) => !validRibbonId(id)) ||
        (key === 'separators' && ids.some((id) => !validSeparatorId(id))) ||
        new Set(ids).size !== ids.length
      );
    })
  )
    throw Error(hostText('settings.applet-pages.ribbonIds'));
  for (const key of ['order', 'hidden', 'bottom'])
    if (
      (ribbon[key] as string[]).some(
        (id) => validSeparatorId(id) && !(ribbon.separators as string[]).includes(id),
      )
    )
      throw Error(hostText('settings.applet-pages.separatorRequired'));
  if (!Array.isArray(ribbon.groups) || ribbon.groups.length > 50)
    throw Error(hostText('settings.applet-pages.groupLimit'));
  const groups = ribbon.groups as RibbonGroup[];
  if (!Array.isArray(ribbon.buttons) || ribbon.buttons.length > 100)
    throw Error(hostText('settings.applet-pages.buttonLimit'));
  const buttonIds = new Set<string>();
  ribbon.buttons = (ribbon.buttons as RibbonCommandButton[]).map((button) => {
    if (
      !object(button) ||
      Object.keys(button).some(
        (k) => !['id', 'title', 'icon', 'commandId', 'iconOnly', 'image'].includes(k),
      ) ||
      !validRibbonButtonId(button.id) ||
      (button.image != null && !imageReference(button.image)) ||
      buttonIds.has(button.id) ||
      typeof button.title !== 'string' ||
      !button.title.trim() ||
      button.title.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(button.title) ||
      !ribbonGroupIcons.includes(button.icon) ||
      !validCommandId(button.commandId) ||
      (button.iconOnly !== undefined && typeof button.iconOnly !== 'boolean')
    )
      throw Error(hostText('settings.applet-pages.button'));
    buttonIds.add(button.id);
    return { ...button, title: button.title.trim() };
  });
  if (ribbon.rightClickCommand !== undefined && !validCommandId(ribbon.rightClickCommand))
    throw Error(hostText('settings.applet-pages.rightClick'));
  const missingButton = (id: string) => validRibbonButtonId(id) && !buttonIds.has(id);
  if (
    ['order', 'hidden', 'bottom'].some((k) => (ribbon[k] as string[]).some(missingButton)) ||
    groups.some((g) => object(g) && Array.isArray(g.children) && g.children.some(missingButton))
  )
    throw Error(hostText('settings.applet-pages.buttonRequired'));
  const groupIds = new Set<string>();
  const children = new Set<string>();
  for (const g of groups) {
    if (
      !object(g) ||
      Object.keys(g).some(
        (k) =>
          !['id', 'title', 'icon', 'expansion', 'children', 'iconOnly', 'color', 'image'].includes(
            k,
          ),
      ) ||
      !validGroupId(g.id) ||
      (g.image != null && !imageReference(g.image)) ||
      groupIds.has(g.id) ||
      typeof g.title !== 'string' ||
      g.title.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(g.title) ||
      !ribbonGroupIcons.includes(g.icon) ||
      (g.iconOnly !== undefined && typeof g.iconOnly !== 'boolean') ||
      !['persistent', 'temporary'].includes(g.expansion) ||
      !Array.isArray(g.children) ||
      g.children.length > 500 ||
      g.children.some(
        (id) =>
          !validRibbonId(id) ||
          validGroupId(id) ||
          children.has(id) ||
          (validSeparatorId(id) && !(ribbon.separators as string[]).includes(id)),
      ) ||
      new Set(g.children).size !== g.children.length
    )
      throw Error(hostText('settings.applet-pages.groupDefinition'));
    groupIds.add(g.id);
    for (const id of g.children) children.add(id);
  }
  const order = ribbon.order as string[],
    bottom = ribbon.bottom as string[];
  if (
    order.some((id) => children.has(id)) ||
    bottom.some((id) => children.has(id)) ||
    groups.some((g) => !order.includes(g.id)) ||
    ['order', 'hidden', 'bottom'].some((k) =>
      (ribbon[k] as string[]).some((id) => validGroupId(id) && !groupIds.has(id)),
    ) ||
    order.filter((id) => !validGroupId(id)).length + children.size > 500
  )
    throw Error(hostText('settings.applet-pages.groupChildren'));
  ribbon.groups = groups.map((g) => ({
    ...g,
    title: g.title.trim(),
    children: [...g.children],
    ...(g.color !== undefined ? { color: parseRibbonColor(g.color) } : {}),
  }));
  if (ribbon.separatorTitles !== undefined) {
    if (!object(ribbon.separatorTitles) || Object.keys(ribbon.separatorTitles).length > 50)
      throw Error(hostText('settings.applet-pages.separatorLimit'));
    const titles: Record<string, string> = {};
    for (const [id, title] of Object.entries(ribbon.separatorTitles)) {
      if (
        !(ribbon.separators as string[]).includes(id) ||
        typeof title !== 'string' ||
        title.trim().length > 80 ||
        /[\x00-\x1f\x7f]/.test(title)
      )
        throw Error(hostText('settings.applet-pages.separatorName'));
      if (title.trim()) titles[id] = title.trim();
    }
    ribbon.separatorTitles = titles;
  }
  if (!object(ribbon.itemOverrides) || Object.keys(ribbon.itemOverrides).length > 500)
    throw Error(hostText('settings.applet-pages.displayLimit'));
  const overrides: Record<string, RibbonItemOverride> = {};
  for (const [id, value] of Object.entries(ribbon.itemOverrides)) {
    if (
      !validRibbonId(id) ||
      validGroupId(id) ||
      validSeparatorId(id) ||
      validRibbonButtonId(id) ||
      !object(value) ||
      (value.image != null && !imageReference(value.image)) ||
      (value.placement !== undefined && !['top', 'bottom'].includes(value.placement as string)) ||
      Object.keys(value).some(
        (key) =>
          ![
            'title',
            'icon',
            'iconOnly',
            'lastKnownTitle',
            'image',
            'placement',
            'displayModeIcons',
          ].includes(key),
      ) ||
      (value.displayModeIcons !== undefined && id !== 'ribbon-display-mode') ||
      (value.icon !== undefined &&
        value.icon !== null &&
        !ribbonGroupIcons.includes(value.icon as any)) ||
      ['title', 'lastKnownTitle'].some(
        (key) =>
          value[key] !== undefined &&
          (typeof value[key] !== 'string' ||
            (value[key] as string).trim().length > 80 ||
            /[\x00-\x1f\x7f]/.test(value[key] as string)),
      ) ||
      (value.iconOnly !== undefined && typeof value.iconOnly !== 'boolean')
    )
      throw Error(hostText('settings.applet-pages.displayName'));
    const title = (value.title as string | undefined)?.trim();
    const lastKnownTitle = (value.lastKnownTitle as string | undefined)?.trim();
    if (
      title ||
      lastKnownTitle ||
      value.iconOnly !== undefined ||
      value.icon !== undefined ||
      value.displayModeIcons !== undefined ||
      value.image !== undefined ||
      value.placement !== undefined
    )
      overrides[id] = {
        ...(value.displayModeIcons !== undefined
          ? { displayModeIcons: parseRibbonDisplayModeIcons(value.displayModeIcons) }
          : {}),
        ...(value.icon !== undefined ? { icon: value.icon as RibbonItemOverride['icon'] } : {}),
        ...(title ? { title } : {}),
        ...(value.image !== undefined ? { image: value.image as RegisteredImageRef | null } : {}),
        ...(value.placement !== undefined
          ? { placement: value.placement as 'top' | 'bottom' }
          : {}),
        ...(lastKnownTitle ? { lastKnownTitle } : {}),
        ...(value.iconOnly !== undefined ? { iconOnly: value.iconOnly as boolean } : {}),
      };
  }
  ribbon.itemOverrides = overrides;
  return ribbon as unknown as Settings['ribbon'];
}
