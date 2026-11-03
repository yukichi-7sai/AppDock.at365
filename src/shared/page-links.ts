import type { ExtensionSnapshot, Settings } from './contracts';
import { builtinRibbon, pageKey, pageDisplay } from './applet-pages';
import { isPageRoute } from './navigation';
import { hostSettingsPages, appletSettingsPageId } from './settings-navigation';
import { pageLinkKey, type PageLinkTarget } from './description-text';
import { hostText } from './i18n';

export type PageReference = PageLinkTarget & {
  title: string;
  available: boolean;
  disabledReason?: string;
};
/** Use the ribbon and settings names even when their navigation entries are hidden. */
export function pageReferences(
  applets: ExtensionSnapshot[],
  settings: Settings,
): Map<string, PageReference> {
  const refs: PageReference[] = [
    ...builtinRibbon
      .filter((item) => isPageRoute(item.id))
      .map(({ id, title }) => ({ kind: 'page' as const, id, title, available: true })),
    ...hostSettingsPages.map(([id, title]) => ({
      kind: 'setting' as const,
      id,
      title,
      available: true,
    })),
    ...applets.flatMap((applet): PageReference[] => [
      {
        kind: 'setting',
        id: appletSettingsPageId(applet.id),
        title: applet.displayName,
        available: true,
      },
      ...(applet.pages ?? []).map((page): PageReference => {
        const available =
          applet.enabled &&
          applet.state === 'running' &&
          pageDisplay(settings, applet.id, page) === 'page';
        return {
          kind: 'page',
          id: pageKey(applet.id, page.id),
          title: page.title,
          available,
          ...(!available ? { disabledReason: hostText('pages.link.unavailable') } : {}),
        };
      }),
    ]),
  ];
  return new Map(refs.map((ref) => [pageLinkKey(ref), ref]));
}
