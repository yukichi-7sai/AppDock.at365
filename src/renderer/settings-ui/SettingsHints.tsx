import { createContext, useContext } from 'react';

/** Optional layout hints share the page preference with portal dialogs. */
export const SettingsHintsContext = createContext(true);
export const useSettingsHints = () => useContext(SettingsHintsContext);
