export const MEDIA_CONTROL_STEPS = 16;

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function percentToStep(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      MEDIA_CONTROL_STEPS,
      Math.round((value / 100) * MEDIA_CONTROL_STEPS),
    ),
  );
}

export function stepToPercent(step: number): number {
  const clampedStep = Math.max(0, Math.min(MEDIA_CONTROL_STEPS, step));

  return Math.round((clampedStep / MEDIA_CONTROL_STEPS) * 100);
}

export function formatPercent(value: number | null): string {
  return value === null ? "--%" : `${value}%`;
}

export function formatStep(step: number | null): string {
  return step === null ? "--/16" : `${step}/16`;
}
