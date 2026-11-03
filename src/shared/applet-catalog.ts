export interface CatalogEdition {
  id: string;
  displayName: string;
  description?: string;
  tagline?: string;
  version: string;
  date: string;
}

export interface CatalogRelease extends CatalogEdition {
  source: string;
  minimumHostVersion?: string;
  unavailable?: 'package' | 'host';
}

export interface AppletCatalogEntry {
  repository: string;
  refreshFailed?: boolean;
  release: CatalogRelease | 'unpublished' | 'error';
  development: CatalogEdition | 'error';
}
