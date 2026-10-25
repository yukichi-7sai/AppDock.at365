import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type { OverlayController } from './overlay-controller';
import type { UiPresentation } from './ui-presentation';
import type { RibbonAnchor } from '../../shared/ribbon';
import type { OverlayAction, RibbonGroupModel } from '../../shared/overlays';

/** One temporary group, bound to the source Shell and its exact visible membership. */
export class RibbonGroupSession implements OverlayController {
  readonly id = randomUUID();
  readonly kind = 'ribbon-group';
  get sourceId() {
    return this.groupId;
  }
  private closed = false;
  private onClose = () => {};
  private signature: string;
  private initial: NonNullable<ReturnType<UiPresentation['group']>>;
  constructor(
    private ui: UiPresentation,
    private groupId: string,
    private anchor: RibbonAnchor,
    private failed: (error: unknown) => void,
    private viewport?: RibbonAnchor,
  ) {
    const current = ui.group(groupId);
    if (!current || current.group.expansion !== 'temporary')
      throw Error(hostText('services.ribbonGroupSession.unavailable'));
    this.initial = current;
    this.signature = this.membership(current);
  }
  private membership(value: NonNullable<ReturnType<UiPresentation['group']>>) {
    return value.configuration;
  }
  snapshot(): RibbonGroupModel {
    const value = this.ui.group(this.groupId);
    if (!value || this.signature !== this.membership(value)) this.cancel('source-changed');
    const current = value ?? this.initial;
    return {
      schemaVersion: 1,
      id: this.id,
      contextId: 'primary',
      kind: this.kind,
      modal: true,
      dark: current.view.dark,
      revision: current.view.revision,
      content: {
        groupId: this.groupId,
        title: current.group.title,
        parent: current.group,
        anchor: this.anchor,
        ...(this.viewport ? { viewport: this.viewport } : {}),
        displayMode: current.view.displayMode,
        items: current.items,
      },
    };
  }
  onClosed(callback: () => void) {
    this.onClose = callback;
  }
  cancel(_reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
  async act(action: OverlayAction) {
    if (this.closed || !action || action.id !== this.id) throw Error('Stale ribbon group session');
    if (action.type === 'dismiss') {
      this.cancel('dismissed');
      return;
    }
    this.snapshot();
    if (this.closed || action.type !== 'ribbonChoose') throw Error('Invalid ribbon action');
    const current = this.ui.group(this.groupId)!;
    if (!current.items.some((item) => item.actionId === action.actionId && item.enabled))
      throw Error('Button is no longer available');
    const request = {
      epoch: current.view.epoch,
      requestId: action.requestId,
      actionId: action.actionId,
    };
    const operation = this.ui.invoke(request, this.id, undefined, { groupId: this.groupId });
    this.cancel('selected');
    try {
      await operation;
    } catch (error) {
      this.failed(error);
    } finally {
      this.ui.disconnect(this.id);
    }
  }
}
