import type { ExtensionManifest, ExtensionSnapshot, Settings } from './contracts';
import { validCommandId } from './commands';
import { imageReference, type RegisteredImageRef } from './registered-images';
import {
  ribbonGroupIcons,
  parseRibbonColor,
  type RibbonGroup,
  type RibbonItemOverride,
  type RibbonCommandButton,
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
  { id: 'home', title: 'ホーム', icon: 'home' },
  { id: 'settings', title: '設定', icon: 'settings' },
  { id: 'logs', title: 'ログ', icon: 'logs' },
  { id: 'notifications', title: '通知センター', icon: 'bell' },
  { id: 'theme', title: 'テーマを切り替え', icon: 'sun' },
];
export const pageKey = (extensionId: string, pageId: string) => `page:${extensionId}:${pageId}`;
export const validPageId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-z0-9][a-z0-9.-]{0,79}$/.test(id) &&
  !['constructor', 'prototype', '__proto__'].includes(id);
export const validRibbonId = (id: unknown): id is string =>
  typeof id === 'string' &&
  (id === 'extensions' || builtinRibbon.some((item) => item.id === id) ||
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
    throw Error('ページは10件以下の配列とpages capabilityが必要です。');
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
      throw Error('ページのID・名前・アイコン・表示方法・起動コマンドを確認してください。');
    if (
      page.source === 'local' &&
      (typeof page.ui !== 'string' || !page.ui || !/\.html$/i.test(page.ui))
    )
      throw Error('ローカルページにはApplet内のHTMLファイルが必要です。');
    if (page.source === 'web-accounts') {
      if (
        web ||
        !manifest.webAccounts ||
        !manifest.capabilities?.includes('web-accounts') ||
        page.ui !== undefined
      )
        throw Error('Webアカウントのページは1つだけ宣言できます。');
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
    ...builtinRibbon.slice(0, 4),
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
    ...builtinRibbon.slice(4),
    ...separators.map((id, index): RibbonItem => ({
      id,
      title: `セパレーター ${index + 1}`,
      icon: '',
      kind: 'separator',
    })),
    ...groups.map((group): RibbonItem => ({
      id: group.id,
      title: group.title || 'グループ',
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
    throw Error('ribbon.order / hidden / bottom / separators は重複のないリボンIDの配列です。');
  for (const key of ['order', 'hidden', 'bottom'])
    if (
      (ribbon[key] as string[]).some(
        (id) => validSeparatorId(id) && !(ribbon.separators as string[]).includes(id),
      )
    )
      throw Error('セパレーターを使うにはribbon.separatorsへ登録してください。');
  if (!Array.isArray(ribbon.groups) || ribbon.groups.length > 50)
    throw Error('リボングループは50件以下で指定してください。');
  const groups = ribbon.groups as RibbonGroup[];
  if (!Array.isArray(ribbon.buttons) || ribbon.buttons.length > 100)
    throw Error('コマンドボタンは100件以下で指定してください。');
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
      throw Error('コマンドボタンのID・名前・アイコン・コマンドを確認してください。');
    buttonIds.add(button.id);
    return { ...button, title: button.title.trim() };
  });
  if (ribbon.rightClickCommand !== undefined && !validCommandId(ribbon.rightClickCommand))
    throw Error('右クリックのコマンドIDを確認してください。');
  const missingButton = (id: string) => validRibbonButtonId(id) && !buttonIds.has(id);
  if (
    ['order', 'hidden', 'bottom'].some((k) => (ribbon[k] as string[]).some(missingButton)) ||
    groups.some((g) => object(g) && Array.isArray(g.children) && g.children.some(missingButton))
  )
    throw Error('コマンドボタンを使うにはribbon.buttonsへ登録してください。');
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
      throw Error('グループのID・名前・アイコン・展開方法・子の所属を確認してください。');
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
    throw Error('グループの子は1つの所属先だけに置き、グループをトップレベルへ配置してください。');
  ribbon.groups = groups.map((g) => ({
    ...g,
    title: g.title.trim(),
    children: [...g.children],
    ...(g.color !== undefined ? { color: parseRibbonColor(g.color) } : {}),
  }));
  if (ribbon.separatorTitles !== undefined) {
    if (!object(ribbon.separatorTitles) || Object.keys(ribbon.separatorTitles).length > 50)
      throw Error('セパレーター名は50件以下で指定してください。');
    const titles: Record<string, string> = {};
    for (const [id, title] of Object.entries(ribbon.separatorTitles)) {
      if (
        !(ribbon.separators as string[]).includes(id) ||
        typeof title !== 'string' ||
        title.trim().length > 80 ||
        /[\x00-\x1f\x7f]/.test(title)
      )
        throw Error('セパレーターのIDと80文字以内の名前を確認してください。');
      if (title.trim()) titles[id] = title.trim();
    }
    ribbon.separatorTitles = titles;
  }
  if (!object(ribbon.itemOverrides) || Object.keys(ribbon.itemOverrides).length > 500)
    throw Error('リボンの表示設定は500件以下のオブジェクトです。');
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
        (key) => !['title', 'iconOnly', 'lastKnownTitle', 'image', 'placement'].includes(key),
      ) ||
      ['title', 'lastKnownTitle'].some(
        (key) =>
          value[key] !== undefined &&
          (typeof value[key] !== 'string' ||
            (value[key] as string).trim().length > 80 ||
            /[\x00-\x1f\x7f]/.test(value[key] as string)),
      ) ||
      (value.iconOnly !== undefined && typeof value.iconOnly !== 'boolean')
    )
      throw Error('リボンのボタン名・アイコンのみ表示を確認してください。');
    const title = (value.title as string | undefined)?.trim();
    const lastKnownTitle = (value.lastKnownTitle as string | undefined)?.trim();
    if (
      title ||
      lastKnownTitle ||
      value.iconOnly !== undefined ||
      value.image !== undefined ||
      value.placement !== undefined
    )
      overrides[id] = {
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
