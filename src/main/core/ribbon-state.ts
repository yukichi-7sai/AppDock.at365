import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import { atomicWrite } from './settings';
import { validGroupId } from '../../shared/applet-pages';

/** PC-local UI state. A failed write never changes the published state. */
export class RibbonState {
  private expanded: Record<string, boolean> = {};
  constructor(
    private file: string,
    private changed: () => void,
    private failed: (error: unknown) => void,
    private groupIds?: () => string[],
  ) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        !value ||
        value.schemaVersion !== 1 ||
        !value.expanded ||
        Array.isArray(value.expanded) ||
        typeof value.expanded !== 'object' ||
        Object.entries(value.expanded).some(
          ([id, open]) => !validGroupId(id) || typeof open !== 'boolean',
        )
      )
        throw Error(hostText('services.ribbonState.readFailed'));
      this.expanded = value.expanded;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed(error);
    }
  }
  isExpanded(id: string) {
    return (!this.groupIds || this.groupIds().includes(id)) && this.expanded[id] === true;
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
    try {
      atomicWrite(this.file, JSON.stringify({ schemaVersion: 1, expanded: next }, null, 2) + '\n');
    } catch (error) {
      this.failed(error);
      throw Error(hostText('services.ribbonState.saveFailed'));
    }
    this.expanded = next;
    this.changed();
    return true;
  }
}
