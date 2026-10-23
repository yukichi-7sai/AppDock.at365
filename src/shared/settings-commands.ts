import { hostText } from './i18n';
import { defaultHostLanguage, hostLanguages } from './host-language';
import type { AppletCommand, SettingDefinition } from './contracts';
import { defaultZoomFactor, minimumZoomFactor, maximumZoomFactor } from './display-zoom';
import {
  accentChoices,
  legacyAccentPalette,
  defaultAccentColor,
  defaultCustomAccent,
} from './appearance';

const switches = ['on', 'off', 'toggle'] as const;
export const hostSettingDefinitions: SettingDefinition[] = [
  {
    key: 'language',
    title: hostText('language.label'),
    description: hostText('language.description'),
    type: 'select',
    default: defaultHostLanguage,
    automation: true,
    options: hostLanguages.map((value) => ({ value, label: hostText(`language.${value}`) })),
  },
  {
    key: 'zoomFactor',
    title: '表示倍率',
    description: 'Electronの表示倍率。1が100%、0.5～2（50～200%）。',
    type: 'number',
    default: defaultZoomFactor,
    minimum: minimumZoomFactor,
    maximum: maximumZoomFactor,
    automation: true,
  },
  {
    key: 'accentColor',
    title: 'アクセントカラー',
    type: 'select',
    default: defaultAccentColor,
    automation: true,
    options: [...accentChoices, legacyAccentPalette].map(({ id, title }) => ({
      value: id,
      label: title,
    })),
  },
  ...(['dark', 'light'] as const).map((tone) => ({
    key: tone === 'dark' ? 'customAccentDark' : 'customAccentLight',
    title: `カスタムアクセントの${tone === 'dark' ? '濃い色' : '淡い色'}`,
    description: '#RRGGBB形式の色。表示時はテーマに合わせて明るさを自動調整します。',
    type: 'string' as const,
    default: defaultCustomAccent[tone],
    automation: true,
  })),
  {
    key: 'theme',
    title: '表示テーマ',
    type: 'select',
    default: 'light',
    automation: true,
    options: ['dark', 'light', 'system'].map((value) => ({ value, label: value })),
  },
  ...[
    ['showHints', 'ヒントの表示', true],
    ['soundEnabled', '音の再生', true],
    ['closeToTray', '閉じるとトレイに格納', true],
    ['startMinimized', '起動時に最小化', false],
  ].map(([key, title, value]) => ({
    key: key as string,
    title: title as string,
    type: 'boolean' as const,
    default: value,
    automation: true,
    generateCommands: [...switches],
  })),
];

export function generatedSettingCommands(
  owner: string,
  definitions: SettingDefinition[],
  available: boolean,
): AppletCommand[] {
  return definitions.flatMap((field) =>
    (field.generateCommands ?? []).map((action) => ({
      id: `${owner}.settings.${field.key}.${action}`,
      title: `${field.title}を${{ on: 'ONにする', off: 'OFFにする', toggle: '切り替える' }[action]}`,
      available,
      automation: field.automation === true,
    })),
  );
}

export function validateSettingCommandIds(
  owner: string,
  definitions: SettingDefinition[],
  registered: { id: string; aliases?: string[] }[],
) {
  const reserved = new Set([
    ...(definitions.some((s) => s.automation) ? [`${owner}.settings.update`] : []),
    ...generatedSettingCommands(owner, definitions, false).map((c) => c.id),
  ]);
  if (
    [...reserved].some((id) => id.length > 180) ||
    registered.some((c) => reserved.has(c.id) || c.aliases?.some((id) => reserved.has(id)))
  )
    throw Error('設定から生成するコマンドIDが長すぎるか、登録コマンドと重複しています。');
}

export function settingInputSchema(field: SettingDefinition): Record<string, unknown> {
  const description = field.description || field.title;
  if (field.type === 'select')
    return { type: 'string', enum: field.options?.map((o) => o.value), description };
  if (field.type === 'number')
    return {
      type: 'number',
      description,
      ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
      ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
    };
  return {
    type: field.type,
    description,
    ...(field.type === 'string' ? { maxLength: 10000 } : {}),
  };
}
