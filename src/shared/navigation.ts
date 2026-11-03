/** The built-in destination used when no startup page is selected or a page is unavailable. */
export const defaultNavigation = { route: 'settings', section: 'about' } as const;

export const navigationCommands = {
  back: 'appdock.navigation.back',
  forward: 'appdock.navigation.forward',
} as const;
export type HistoryDirection = keyof typeof navigationCommands;
export type HistoryAvailability = Record<HistoryDirection, boolean>;

export type PageRoute =
  | 'image-library'
  | 'sound-library'
  | 'text-library'
  | 'extensions'
  | 'settings'
  | 'logs'
  | 'notifications'
  | `page:${string}`;

export function isPageRoute(value: unknown): value is PageRoute {
  return (
    typeof value === 'string' &&
    ([
      'image-library',
      'sound-library',
      'text-library',
      'extensions',
      'settings',
      'logs',
      'notifications',
    ].includes(value) ||
      /^page:[a-z0-9.-]+:[a-z0-9.-]+$/.test(value))
  );
}
