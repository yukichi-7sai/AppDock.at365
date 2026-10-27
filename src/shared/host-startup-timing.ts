export const hostStartupPhases = [
  'modules',
  'electron',
  'settings',
  'launch',
  'recovery',
  'services',
  'apply',
  'images',
  'window',
  'document',
  'discovery',
  'defaults',
  'shells',
  'hotkeys',
  'indicator',
  'gestures',
  'touchpad',
  'ui',
  'applets',
  'integration',
] as const;
export type HostStartupPhase = (typeof hostStartupPhases)[number];
export const hostStartupWork = [
  'settingsRead',
  'settingsJson',
  'settingsValidate',
  'settingsBackup',
  'settingsSnapshot',
  'settingsCombine',
  'commandCatalog',
  'commandState',
  'commandReconcile',
  'hostSnapshot',
  'settingsPage',
] as const;
export type HostStartupWork = (typeof hostStartupWork)[number];
export const hostStartupCounts = [
  'sharedBytes',
  'deviceBytes',
  'readBytes',
  'commandCount',
  'imageCount',
  'appletCount',
] as const;
export type HostStartupCount = (typeof hostStartupCounts)[number];
export type HostStartupMilestone = 'renderer' | 'shown' | 'ready';
export interface HostStartupTiming {
  startedAt: string;
  complete: boolean;
  elapsedMs: number;
  processEntryMs: number;
  milestones: Partial<Record<HostStartupMilestone, number>>;
  phases: {
    id: HostStartupPhase;
    startMs: number;
    durationMs: number;
    state: 'running' | 'ended' | 'error' | 'timeout';
  }[];
  work: { id: HostStartupWork; calls: number; totalMs: number; maxMs: number }[];
  counts: Partial<Record<HostStartupCount, number>>;
}
