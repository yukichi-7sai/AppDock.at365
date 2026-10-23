import { builtinRibbon, pageKey, validPageId } from './applet-pages';
import { validCommandId } from './commands';

export interface ShortcutPageChoice {
  id: string;
  title: string;
  appletId?: string;
  appletTitle?: string;
}

export function hostShortcutPage(route: string): string | undefined {
  return builtinRibbon.some((item) => item.id !== 'theme' && item.id === route)
    ? `host:${route}`
    : undefined;
}

export function validShortcutTarget(id: unknown): id is string {
  // Saved conditions stay inert; never reinterpret them as another host page.
  if (id === 'host:home') return true;
  if (validCommandId(id)) return true;
  if (typeof id !== 'string') return false;
  if (id.startsWith('host:')) return hostShortcutPage(id.slice(5)) === id;
  const parts = id.split(':');
  return (
    parts.length === 3 && parts[0] === 'page' && validCommandId(parts[1]) && validPageId(parts[2])
  );
}

export const shortcutTargetSchema = {
  anyOf: [
    { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$' },
    { enum: ['host:home', ...builtinRibbon.flatMap((item) => hostShortcutPage(item.id) ?? [])] },
    { type: 'string', pattern: '^page:[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}:[a-z0-9][a-z0-9.-]{0,79}$' },
  ],
};

/** Page declarations supply candidates even while their Applet is stopped or disabled. */
export function shortcutPageChoices(
  applets: { id: string; displayName?: string; pages?: { id: string; title: string }[] }[],
): ShortcutPageChoice[] {
  const pages = applets.flatMap((applet) =>
    (applet.pages ?? []).map((page) => ({
      id: pageKey(applet.id, page.id),
      title: page.title,
      appletId: applet.id,
      appletTitle: applet.displayName ?? applet.id,
    })),
  );
  const choices: ShortcutPageChoice[] = [
    ...builtinRibbon.flatMap((item) => {
      const id = hostShortcutPage(item.id);
      return id ? [{ id, title: item.title }] : [];
    }),
    ...pages,
  ];
  return choices.map((page) => {
    if (!page.appletId || choices.filter((other) => other.title === page.title).length < 2)
      return page;
    const sameOwner =
      pages.filter((other) => other.title === page.title && other.appletTitle === page.appletTitle)
        .length > 1;
    return {
      ...page,
      title: `${page.title}（${page.appletTitle}${sameOwner ? ' / ' + page.id.split(':')[2] : ''}）`,
    };
  });
}

export function shortcutTargetTitle(id: string, pages: ShortcutPageChoice[]): string {
  if (id === 'host:home') return '廃止: ホーム';
  const page = pages.find((item) => item.id === id);
  if (page) return page.title;
  const legacy = pages.find((item) => item.appletId === id);
  return legacy ? `${legacy.appletTitle}（Applet内のすべてのページ）` : `未導入: ${id}`;
}
