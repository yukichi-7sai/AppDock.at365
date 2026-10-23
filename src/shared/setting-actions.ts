import { hostText } from './i18n';
import type { DeclaredCommand, SettingAction } from './contracts';

/** Actions invoke declared commands; they never create persisted settings. */
export function parseSettingActions(
  value: unknown,
  commands: DeclaredCommand[],
): SettingAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16)
    throw new Error(hostText('services.sharedSettingActions.countLimit'));
  const seen = new Set<string>();
  return value.map((action) => {
    if (
      !action ||
      typeof action !== 'object' ||
      Array.isArray(action) ||
      typeof action.title !== 'string' ||
      !action.title.trim() ||
      action.title.length > 160 ||
      typeof action.command !== 'string' ||
      seen.has(action.command) ||
      !commands.some((command) => command.id === action.command) ||
      (action.description !== undefined &&
        (typeof action.description !== 'string' || action.description.length > 1000)) ||
      (action.successMessage !== undefined &&
        (typeof action.successMessage !== 'string' ||
          !action.successMessage.trim() ||
          action.successMessage.length > 500))
    )
      throw new Error(hostText('services.sharedSettingActions.invalidDeclaration'));
    seen.add(action.command);
    return {
      title: action.title,
      command: action.command,
      ...(action.description !== undefined ? { description: action.description } : {}),
      ...(action.successMessage !== undefined ? { successMessage: action.successMessage } : {}),
    };
  });
}
