import type { WebContents } from 'electron';
import { defaultZoomFactor } from '../../shared/display-zoom';

let read = () => defaultZoomFactor;
const surfaces = new Set<WebContents>();
export function configureDisplayZoom(reader: () => number) {
  read = reader;
}
export function displayZoomFactor() {
  return read();
}
function apply(contents: WebContents) {
  if (!contents.isDestroyed() && Math.abs(contents.getZoomFactor() - read()) > 0.000001)
    contents.setZoomFactor(read());
}
/** Register presentation contents only; audio and image processing workers keep their own scale. */
export function registerDisplayZoom(contents: WebContents) {
  if (surfaces.has(contents)) return;
  surfaces.add(contents);
  // Remote sites and local file pages must not share Chromium's origin-based zoom state.
  contents.setZoomMode('isolated');
  apply(contents);
  contents.on('dom-ready', () => apply(contents));
  contents.once('destroyed', () => surfaces.delete(contents));
}
export function refreshDisplayZoom() {
  for (const contents of surfaces) apply(contents);
}
