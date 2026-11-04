// Load before shared setting definitions are evaluated, using the main process startup snapshot.
export const accentColorCatalog = await window.appdockAppearance.accentColors();
