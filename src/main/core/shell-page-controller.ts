import type { ShellPageAction, ShellPageModel, ShellPageRequest } from '../../shared/shell-pages';

/** Content is independent of its WebContents, provider and native bounds. */
export interface ShellPageController {
  readonly id: string;
  readonly route: string;
  readonly kind: ShellPageModel['kind'];
  snapshot(): ShellPageModel;
  act(action: ShellPageAction): Promise<unknown>;
  update?(request: ShellPageRequest): void;
  /** Release View-owned recording/selection without disposing content state. */
  viewClosed?(): void;
  dispose?(): void;
}
