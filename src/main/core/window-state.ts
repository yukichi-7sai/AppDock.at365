import { hostText } from '../../shared/i18n';
import type { BrowserWindow, Rectangle } from 'electron';
import { stateStorage, type StateStorage } from './state-storage';
import { SettingsConflictError } from './settings';

export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

export const windowMinimum = { width: 900, height: 620 };

export function restoreWindowBounds(window: BrowserWindow, bounds: Rectangle) {
  const requested = { ...bounds };
  const minimum = window.getMinimumSize();
  let relaxedMinimum = false;
  // Fractional Windows scaling can round DIP sizes up on each setBounds call.
  // Compensate against the actual native result so restarts do not grow the window.
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      window.setBounds(requested);
      const actual = window.getNormalBounds();
      if (
        Object.keys(bounds).every(
          (key) => actual[key as keyof Rectangle] === bounds[key as keyof Rectangle],
        )
      )
        return;
      for (const key of ['x', 'y', 'width', 'height'] as const)
        requested[key] += bounds[key] - actual[key];
      requested.width = Math.max(1, requested.width);
      requested.height = Math.max(1, requested.height);
      // Allow the compensating request below the nominal minimum; the resulting
      // native bounds still target the fitted size. Restore the constraint below.
      if (requested.width < minimum[0] || requested.height < minimum[1]) {
        window.setMinimumSize(
          Math.min(minimum[0], requested.width),
          Math.min(minimum[1], requested.height),
        );
        relaxedMinimum = true;
      }
    }
  } finally {
    if (relaxedMinimum) window.setMinimumSize(minimum[0], minimum[1]);
  }
}

export function parseWindowState(value: unknown): WindowState {
  const state = value as WindowState | null;
  const bounds = state?.bounds;
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    typeof state?.maximized !== 'boolean'
  )
    throw new Error(hostText('services.windowState.invalidState'));
  return {
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    maximized: state.maximized,
  };
}

// Electron bounds and display work areas both use device-independent pixels.
export function fitWindowState(
  state: WindowState,
  workAreas: Rectangle[],
  minimum = windowMinimum,
): WindowState {
  if (!workAreas.length) return state;
  const b = state.bounds;
  const overlap = (area: Rectangle) =>
    Math.max(0, Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x)) *
    Math.max(0, Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y));
  const area = workAreas.reduce((best, next) => (overlap(next) > overlap(best) ? next : best));
  // Preserve the saved size even on a smaller display; only recover its position.
  const width = Math.max(minimum.width, b.width);
  const height = Math.max(minimum.height, b.height);
  return {
    bounds: {
      x: Math.max(area.x, Math.min(b.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(b.y, area.y + area.height - height)),
      width,
      height,
    },
    maximized: state.maximized,
  };
}

export class WindowStateStore {
  state?: WindowState;
  private timer?: ReturnType<typeof setTimeout>;
  private saved = '';
  private reloadRequired = false;
  private storage: StateStorage;

  constructor(
    storage: StateStorage | string | undefined,
    private onError: (error: unknown) => void,
  ) {
    this.storage = stateStorage(storage);
  }

  load(workAreas: Rectangle[], minimum = windowMinimum) {
    try {
      const value = this.storage.read();
      if (value !== undefined) {
        this.state = fitWindowState(parseWindowState(value), workAreas, minimum);
      }
    } catch (error) {
      this.onError(error);
    }
    return this.state;
  }

  track(window: BrowserWindow) {
    const capture = () => {
      // Hidden startup and minimization must not replace the last visible state.
      if (
        window.isDestroyed() ||
        !window.isVisible() ||
        window.isMinimized() ||
        window.isFullScreen()
      )
        return;
      this.state = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
    };
    const schedule = () => {
      capture();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 300);
    };
    window.on('move', schedule);
    window.on('resize', schedule);
    window.on('maximize', schedule);
    window.on('unmaximize', schedule);
    window.on('restore', schedule);
    window.on('show', schedule);
    window.on('close', () => {
      capture();
      this.flush();
    });
    window.on('closed', () => this.flush());
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    try {
      if (this.reloadRequired) {
        this.reloadAfterConflict();
        return;
      }
      if (!this.state) return;
      const text = JSON.stringify(parseWindowState(this.state), null, 2) + '\n';
      if (text === this.saved) return;
      this.storage.write(parseWindowState(this.state));
      this.saved = text;
    } catch (error) {
      if (!(error instanceof SettingsConflictError)) {
        this.onError(error);
        return;
      }
      this.reloadRequired = true;
      try {
        this.reloadAfterConflict();
      } catch (readError) {
        this.onError(readError);
      }
    }
  }

  private reloadAfterConflict() {
    // Discard this capture rather than overwrite an incoming position.
    // The next window event captures fresh bounds against the new baseline.
    const value = this.storage.read();
    const state = value === undefined ? undefined : parseWindowState(value);
    this.state = state;
    this.saved = state ? JSON.stringify(state, null, 2) + '\n' : '';
    this.reloadRequired = false;
  }
}
