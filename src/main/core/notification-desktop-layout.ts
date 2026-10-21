import type { Rectangle } from 'electron';
/** Coordinates are Electron DIPs, including negative monitor origins. */
export function desktopNotificationBounds(
  work: Rectangle,
  tray: Rectangle | undefined,
  desiredHeight: number,
  zoom = 1,
) {
  const margin = Math.min(12, Math.max(0, Math.min(work.width, work.height) / 8));
  const width = Math.max(1, Math.min(440 * zoom, work.width - margin * 2));
  const height = Math.max(
    1,
    Math.min(
      Math.ceil(desiredHeight * zoom),
      Math.min(600 * zoom, work.height * 0.6),
      work.height - margin * 2,
    ),
  );
  const anchor =
    tray && tray.width > 0 && tray.height > 0
      ? { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 }
      : undefined;
  const left = !!anchor && anchor.x < work.x + work.width / 2;
  const top = !!anchor && anchor.y < work.y + work.height / 2;
  return {
    x: Math.round(left ? work.x + margin : work.x + work.width - width - margin),
    y: Math.round(top ? work.y + margin : work.y + work.height - height - margin),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}
