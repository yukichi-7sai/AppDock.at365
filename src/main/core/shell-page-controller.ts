import type { ShellPageAction, ShellPageModel, ShellPageRequest } from '../../shared/shell-pages';

/** Content is independent of its WebContents, provider and native bounds. */
export interface ShellPageController {
  readonly id: string;
  readonly route: string;
  readonly kind: ShellPageModel['kind'];
  snapshot(): ShellPageModel;
  act(action: ShellPageAction): Promise<unknown>;
  /** Read-only asset loads may finish while a host dialog blocks user actions. */
  passive?(action: ShellPageAction): boolean;
  update?(request: ShellPageRequest): void;
  /** Release View-owned recording/selection without disposing content state. */
  viewClosed?(): void;
  dispose?(): void;
}
