import { hostText } from '../../shared/i18n';
import { stateStorage, type StateStorage } from './state-storage';
import { validGroupId } from '../../shared/applet-pages';
import type { RibbonDisplayMode } from '../../shared/ribbon';

/** PC-local UI state. A failed write never changes the published state. */
export class RibbonState {
  private expanded: Record<string, boolean> = {};
  private mode: RibbonDisplayMode = 'compact';
  private storage: StateStorage;
  constructor(
    storage: StateStorage | string,
    private changed: () => void,
    private failed: (error: unknown) => void,
    private groupIds?: () => string[],
  ) {
    this.storage = stateStorage(storage);
    try {
      const value: any = this.storage.read();
      if (value === undefined) return;
      if (
        !value ||
        value.schemaVersion !== 1 ||
        !value.expanded ||
        Array.isArray(value.expanded) ||
        typeof value.expanded !== 'object' ||
        (value.displayMode !== undefined &&
          value.displayMode !== 'compact' &&
          value.displayMode !== 'expanded') ||
        Object.entries(value.expanded).some(
          ([id, open]) => !validGroupId(id) || typeof open !== 'boolean',
        )
      )
        throw Error(hostText('services.ribbonState.readFailed'));
      this.expanded = value.expanded;
      this.mode = value.displayMode ?? 'compact';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed(error);
    }
  }
  isExpanded(id: string) {
    return (!this.groupIds || this.groupIds().includes(id)) && this.expanded[id] === true;
  }
  get displayMode() {
    return this.mode;
  }
  setDisplayMode(mode: RibbonDisplayMode) {
    if (mode !== 'compact' && mode !== 'expanded')
      throw Error(hostText('services.ribbonState.invalidMode'));
    if (mode === this.mode) return false;
    this.write(this.expanded, mode);
    this.mode = mode;
    this.changed();
    return true;
  }
  set(id: string, open: boolean) {
    if (!validGroupId(id) || (this.groupIds && !this.groupIds().includes(id)))
      throw Error(hostText('services.ribbonState.invalidId'));
    if (this.isExpanded(id) === open) return false;
    const next = {
      ...Object.fromEntries(
        Object.entries(this.expanded).filter(
          ([key]) => !this.groupIds || this.groupIds().includes(key),
        ),
      ),
      [id]: open,
    };
    this.write(next, this.mode);
    this.expanded = next;
    this.changed();
    return true;
  }
  private write(expanded: Record<string, boolean>, displayMode: RibbonDisplayMode) {
    try {
      this.storage.write({ schemaVersion: 1, expanded, displayMode });
    } catch (error) {
      this.failed(error);
      throw Error(hostText('services.ribbonState.saveFailed'));
    }
  }
}
