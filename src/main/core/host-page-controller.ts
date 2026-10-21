import type { HostPageAction, HostPageModel, HostPageRequest } from '../../shared/host-pages';

/** Host-owned page state and operations, independent of renderer layout. */
export interface HostPageController {
  readonly id: string;
  readonly route: string;
  readonly kind: HostPageModel['kind'];
  snapshot(): HostPageModel;
  act(action: HostPageAction): Promise<unknown>;
  /** Read-only asset loads may finish while a host dialog blocks user actions. */
  passive?(action: HostPageAction): boolean;
  update?(request: HostPageRequest): void;
  dispose?(): void;
}
