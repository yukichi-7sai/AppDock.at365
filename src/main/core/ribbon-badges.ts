import { hostText } from '../../shared/i18n';
import { parseRibbonBadge, type RibbonBadge } from '../../shared/ribbon';

export class RibbonBadges {
  private values = new Map<string, { owner: string; generation: string; badge: RibbonBadge }>();
  constructor(
    private live: (owner: string) => { generation: string; ids: Set<string> } | undefined,
    private changed: () => void,
  ) {}
  set(owner: string, generation: string, id: string, value: unknown) {
    const live = this.live(owner);
    if (!live || live.generation !== generation || !live.ids.has(id))
      throw Error(hostText('services.ribbonBadges.ownPageOnly'));
    const badge = parseRibbonBadge(value);
    const previous = this.values.get(id);
    let changed = false;
    if (!badge) {
      changed = this.values.delete(id);
    } else if (
      !previous ||
      previous.owner !== owner ||
      previous.generation !== generation ||
      JSON.stringify(previous.badge) !== JSON.stringify(badge)
    ) {
      this.values.set(id, { owner, generation, badge });
      changed = true;
    }
    if (changed) this.changed();
    return { accepted: true, changed };
  }
  get(id: string): RibbonBadge {
    const entry = this.values.get(id);
    if (!entry) return null;
    const live = this.live(entry.owner);
    return live?.generation === entry.generation && live.ids.has(id) ? entry.badge : null;
  }
  reconcile() {
    let removed = false;
    for (const [id, entry] of this.values) {
      const live = this.live(entry.owner);
      if (!live || live.generation !== entry.generation || !live.ids.has(id)) {
        this.values.delete(id);
        removed = true;
      }
    }
    if (removed) this.changed();
  }
}
