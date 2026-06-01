import * as Haptics from "expo-haptics";

export function triggerButtonHaptic(): void {
  void Haptics.selectionAsync().catch(() => {
    // Haptics can be unavailable on simulators or unsupported devices.
  });
}

export function withHaptic<T extends unknown[]>(
  handler?: (...args: T) => void,
): ((...args: T) => void) | undefined {
  if (!handler) {
    return undefined;
  }

  return (...args: T) => {
    triggerButtonHaptic();
    handler(...args);
  };
}
