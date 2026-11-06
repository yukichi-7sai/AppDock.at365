import { hostText } from './i18n';
export interface WebPageState {
  loading: boolean;
  error: string;
  origin: string;
  canGoBack: boolean;
  canGoForward: boolean;
}
export interface RemotePageDefinition {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  display: 'page' | 'window';
  navigation: 'none' | 'same-origin' | 'any';
  allowedOrigins: string[];
  icon: string;
}
export function webUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\x00-\x20\x7f]/.test(raw))
    throw Error(hostText('services.sharedWebContent.url'));
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw Error(hostText('services.sharedWebContent.unsafeUrl'));
  return url.href;
}
export function allowedWebNavigation(item: RemotePageDefinition, target: string): boolean {
  try {
    const url = new URL(webUrl(target)),
      initial = new URL(item.url);
    const documentUrl = (value: URL) => {
      const copy = new URL(value.href);
      copy.hash = '';
      return copy.href;
    };
    if (item.navigation === 'none')
      return documentUrl(url) === documentUrl(initial) || item.allowedOrigins.includes(url.origin);
    return (
      item.navigation === 'any' ||
      url.origin === initial.origin ||
      item.allowedOrigins.includes(url.origin)
    );
  } catch {
    return false;
  }
}
