export interface AppletPackagePlan {
  planId: string;
  operation: 'install' | 'uninstall';
  id: string;
  name: string;
  version: string;
  runtime?: string;
  minimumHostVersion?: string;
  updateSource?: string;
  siteCount?: number;
  shell?: boolean;
}

/** Preview failures belong to the install dialog, rather than the settings page. */
export type AppletPackagePreviewResult =
  AppletPackagePlan | { cancelled: true } | { error: string };
