/** The built-in destination used when no startup page is selected or a page is unavailable. */
export const defaultNavigation = { route: 'settings', section: 'about' } as const;

export type PageRoute =
  'image-library' | 'extensions' | 'settings' | 'logs' | 'notifications' | `page:${string}`;

export function isPageRoute(value: unknown): value is PageRoute {
  return (
    typeof value === 'string' &&
    (['image-library', 'extensions', 'settings', 'logs', 'notifications'].includes(value) ||
      /^page:[a-z0-9.-]+:[a-z0-9.-]+$/.test(value))
  );
}
