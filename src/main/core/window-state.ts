import { hostText } from '../../shared/i18n';
import type { BrowserWindow, Rectangle, Screen } from 'electron';
import { stateStorage, type StateStorage } from './state-storage';
import { SettingsConflictError } from './settings';

export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

export const windowMinimum = { width: 1200, height: 670 };

export function windowMinimumForArea(area: Rectangle) {
  return {
    width: Math.min(windowMinimum.width, area.width),
    height: Math.min(windowMinimum.height, area.height),
  };
}

export function defaultWindowState(area: Rectangle): WindowState {
  return fitWindowState(
    {
      bounds: {
        x: area.x + Math.floor((area.width - 1280) / 2),
        y: area.y + Math.floor((area.height - 840) / 2),
        width: 1280,
        height: 840,
      },
      maximized: false,
    },
    [area],
  );
}

/** Keep the host usable when moving between displays or changing display scaling. */
export function trackWindowWorkArea(window: BrowserWindow, screen: Screen) {
  let previousArea: Rectangle | undefined;
  let updating = false;
  const equal = (a: Rectangle | undefined, b: Rectangle) =>
    a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const refresh = (force = false) => {
    if (updating || window.isDestroyed() || window.isMinimized()) return;
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    if (!force && equal(previousArea, area)) return;
    previousArea = { ...area };
    updating = true;
    try {
      const minimum = windowMinimumForArea(area);
      const [width, height] = window.getMinimumSize();
      if (width !== minimum.width || height !== minimum.height)
        window.setMinimumSize(minimum.width, minimum.height);
      if (window.isMaximized() || window.isFullScreen()) return;
      const bounds = window.getNormalBounds();
      const fitted = fitWindowState({ bounds, maximized: false }, [area]).bounds;
      if (!equal(bounds, fitted)) restoreWindowBounds(window, fitted);
    } finally {
      updating = false;
    }
  };
  const moved = () => refresh();
  const changed = () => refresh(true);
  window.on('move', moved);
  window.on('resize', moved);
  window.on('restore', changed);
  window.on('unmaximize', changed);
  window.on('leave-full-screen', changed);
  screen.on('display-added', changed);
  screen.on('display-removed', changed);
  screen.on('display-metrics-changed', changed);
  window.once('closed', () => {
    screen.removeListener('display-added', changed);
    screen.removeListener('display-removed', changed);
    screen.removeListener('display-metrics-changed', changed);
    window.removeListener('move', moved);
    window.removeListener('resize', moved);
    window.removeListener('restore', changed);
    window.removeListener('unmaximize', changed);
    window.removeListener('leave-full-screen', changed);
  });
  refresh();
}

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
  const width = Math.min(area.width, Math.max(minimum.width, b.width));
  const height = Math.min(area.height, Math.max(minimum.height, b.height));
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
