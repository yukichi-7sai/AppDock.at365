export interface AssistanceOptions {
  enabled: boolean;
  intervalSeconds: number;
}
export const defaultFileWatchAssistanceOptions: Readonly<AssistanceOptions> = Object.freeze({
  enabled: false,
  intervalSeconds: 300,
});
export const minimumFileWatchAssistanceIntervalSeconds = 2;
