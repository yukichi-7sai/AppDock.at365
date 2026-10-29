import type {
  NotificationBannerPosition,
  NotificationBannerModel,
} from '../../shared/notifications';

/** Anchor the measured surface without changing notification order, lifetime or focus. */
export function bannerNotificationBounds(
  content: { width: number; height: number },
  viewport: NotificationBannerModel['viewport'],
  renderedHeight: number,
  zoom: number,
  position: NotificationBannerPosition,
) {
  const width = Math.max(1, Math.min(content.width, Math.round(viewport.width * zoom)));
  const height = Math.max(
    1,
    Math.min(content.height, Math.round(Math.min(renderedHeight, viewport.maxHeight) * zoom)),
  );
  const horizontal = position.endsWith('-left')
    ? 16 * zoom
    : position.endsWith('-right')
      ? content.width - width - 16 * zoom
      : (content.width - width) / 2;
  const vertical = position.startsWith('bottom-') ? content.height - height - 48 * zoom : 48 * zoom;
  return {
    x: Math.max(0, Math.min(content.width - width, Math.round(horizontal))),
    y: Math.max(0, Math.min(content.height - height, Math.round(vertical))),
    width,
    height,
  };
}
