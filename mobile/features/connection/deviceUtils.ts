import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedDevice } from "./types";
import { DEVICES_STORAGE_KEY } from "./storageKeys";

export function sanitizeHostName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim().replace(/\.local$/i, "");

  return cleanValue ? cleanValue.slice(0, 80) : null;
}

export function parseSavedDevices(raw: string | null): SavedDevice[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): SavedDevice[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("host" in item) ||
        typeof item.host !== "string"
      ) {
        return [];
      }

      const host = item.host.trim();

      if (!host) {
        return [];
      }

      const name =
        "name" in item && typeof item.name === "string"
          ? item.name.trim().slice(0, 80)
          : "";
      const lastConnectedAt =
        "lastConnectedAt" in item &&
        typeof item.lastConnectedAt === "number" &&
        Number.isFinite(item.lastConnectedAt)
          ? item.lastConnectedAt
          : 0;

      return [
        {
          id: getDeviceId(host),
          name: name || getDeviceNameFromHost(host),
          host,
          lastConnectedAt,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function upsertDevice(
  devices: SavedDevice[],
  nextDevice: SavedDevice,
): SavedDevice[] {
  const withoutCurrent = devices.filter(
    (device) => device.host !== nextDevice.host,
  );

  return [nextDevice, ...withoutCurrent]
    .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
    .slice(0, 20);
}

export function persistSavedDevices(devices: SavedDevice[]) {
  AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(devices)).catch(
    () => {
      // Ignore storage errors; the in-memory device list is still updated.
    },
  );
}

export function getDeviceId(host: string): string {
  return host.trim().toLowerCase();
}

export function getDeviceNameFromHost(host: string): string {
  const cleanHost = host
    .trim()
    .replace(/^wss?:\/\//, "")
    .replace(/\/$/, "");

  return cleanHost || "Desktop";
}
