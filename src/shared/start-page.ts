import type { ExtensionSnapshot, Settings, SettingOption } from './contracts';
import { pageDisplay, pageKey, validPageId } from './applet-pages';
import { hostText } from './i18n';

export type StartPage = 'about' | `page:${string}`;
export function isStartPage(value: unknown): value is StartPage {
  if (value === 'about') return true;
  if (typeof value !== 'string') return false;
  const [prefix, owner, page, ...extra] = value.split(':');
  return (
    prefix === 'page' &&
    !extra.length &&
    /^[a-z0-9][a-z0-9.-]{0,100}$/.test(owner ?? '') &&
    !['constructor', 'prototype', '__proto__'].includes(owner) &&
    validPageId(page)
  );
}
export function startPageOptions(
  settings: Settings,
  applets: ExtensionSnapshot[],
): SettingOption[] {
  return [
    { value: 'about', label: hostText('settings.aboutSettings.title') },
    ...applets
      .filter(
        (applet) => applet.enabled && !['error', 'stopped', 'stopping'].includes(applet.state),
      )
      .flatMap((applet) =>
        (applet.pages ?? [])
          .filter((page) => pageDisplay(settings, applet.id, page) === 'page')
          .map((page) => ({
            value: pageKey(applet.id, page.id),
            label: `${applet.displayName || applet.name} / ${page.title}`,
          })),
      ),
  ];
}
/** A missing dynamic definition is only final after the provider has finished starting. */
export function startPageState(
  route: string,
  settings: Settings,
  applets: ExtensionSnapshot[],
): 'wait' | 'open' | 'fallback' {
  const [, owner, pageId] = route.split(':');
  const applet = applets.find((applet) => applet.id === owner);
  if (!applet?.enabled || ['error', 'stopping', 'stopped'].includes(applet.state))
    return 'fallback';
  const page = applet.pages?.find((page) => page.id === pageId);
  if (page && pageDisplay(settings, owner, page) !== 'page') return 'fallback';
  if (applet.state !== 'running') return 'wait';
  return page ? 'open' : 'fallback';
}
