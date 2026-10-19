import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import './settings-hint.css';

/** Settings pages share this preference with their portal-based dialogs. */
export const SettingsHintsContext = createContext(true);
export const useSettingsHints = () => useContext(SettingsHintsContext);

/** Optional guidance only. Descriptions, current values and errors remain separate. */
export function SettingsHint({
  as: Element = 'p',
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'small' | 'span' | 'div';
  children: ReactNode;
}) {
  const visible = useSettingsHints();
  return visible && children != null && children !== '' ? (
    <Element {...props} className={`settings-hint ${className}`}>
      {children}
    </Element>
  ) : null;
}
