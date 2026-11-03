import type { HistoryDirection } from '../../shared/navigation';

export interface NavigationPlace {
  route: string;
  pageId?: string;
  itemId?: string;
  logSource?: string;
}
function samePlace(a: NavigationPlace, b: NavigationPlace) {
  return (
    a.route === b.route &&
    a.pageId === b.pageId &&
    a.itemId === b.itemId &&
    a.logSource === b.logSource
  );
}

/** The current place and at most ten transitions live for the primary window's session. */
export class NavigationHistory {
  private places: NavigationPlace[];
  private cursor = 0;
  constructor(initial: NavigationPlace) {
    this.places = [initial];
  }
  get availability() {
    return { back: this.cursor > 0, forward: this.cursor + 1 < this.places.length };
  }
  visit(place: NavigationPlace, replace = false) {
    if (samePlace(this.places[this.cursor], place)) return false;
    if (replace) this.places[this.cursor] = place;
    else {
      this.places.splice(this.cursor + 1, Infinity, place);
      if (this.places.length > 11) this.places.shift();
      this.cursor = this.places.length - 1;
    }
    return true;
  }
  target(direction: HistoryDirection) {
    return this.places[this.cursor + (direction === 'back' ? -1 : 1)];
  }
  arrive(direction: HistoryDirection, place: NavigationPlace) {
    if (this.target(direction) !== place) return false;
    this.cursor += direction === 'back' ? -1 : 1;
    return true;
  }
  prune(valid: (place: NavigationPlace) => boolean) {
    const kept: NavigationPlace[] = [];
    let cursor = 0;
    this.places.forEach((place, i) => {
      if (i !== this.cursor && !valid(place)) return;
      if (!kept.length || !samePlace(kept[kept.length - 1], place)) kept.push(place);
      if (i === this.cursor) cursor = kept.length - 1;
    });
    this.places = kept;
    this.cursor = cursor;
  }
}
