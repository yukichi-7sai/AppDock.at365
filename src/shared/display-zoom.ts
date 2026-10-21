/** Page zoom is relative to the operating system's display scaling. */
export const defaultZoomFactor = 1;
export const minimumZoomFactor = 0.5;
export const maximumZoomFactor = 2;
export const displayZoomChoices = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const displayZoomLabel = (factor: number) => `${Number((factor * 100).toFixed(2))}%`;
