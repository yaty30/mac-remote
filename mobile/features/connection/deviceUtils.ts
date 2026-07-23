import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HostPlatform } from "../../types/protocol";
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
      const platform =
        "platform" in item && isHostPlatform(item.platform)
          ? item.platform
          : undefined;

      return [
        {
          id: getDeviceId(host),
          name: name || getDeviceNameFromHost(host),
          host,
          platform,
          lastConnectedAt,
        },
      ];
    });
  } catch {
    return [];
  }
}

export interface LegacyDeviceToken {
  id: string;
  host: string;
  deviceToken: string;
}

// Reads trusted-device tokens that older builds serialized inline with the
// device metadata, so they can be migrated into SecureStore on launch.
export function extractLegacyDeviceTokens(
  raw: string | null,
): LegacyDeviceToken[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): LegacyDeviceToken[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("host" in item) ||
        typeof item.host !== "string" ||
        !("deviceToken" in item) ||
        typeof item.deviceToken !== "string"
      ) {
        return [];
      }

      const host = item.host.trim();
      const deviceToken = item.deviceToken.trim().slice(0, 256);

      if (!host || !deviceToken) {
        return [];
      }

      return [{ id: getDeviceId(host), host, deviceToken }];
    });
  } catch {
    return [];
  }
}

function isHostPlatform(value: unknown): value is HostPlatform {
  return value === "darwin" || value === "win32";
}

export function upsertDevice(
  devices: SavedDevice[],
  nextDevice: SavedDevice,
): SavedDevice[] {
  const existing = devices.find((device) => device.host === nextDevice.host);
  const deviceWithPlatform = {
    ...nextDevice,
    platform: nextDevice.platform ?? existing?.platform,
  };
  const withoutCurrent = devices.filter(
    (device) => device.host !== nextDevice.host,
  );

  return [deviceWithPlatform, ...withoutCurrent]
    .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
    .slice(0, 20);
}

// Builds the AsyncStorage payload. Device metadata is stored in the clear, but
// a token is only ever written back inline when SecureStore could not persist
// it (tracked in pendingTokens). This keeps a durable fallback so a failed
// SecureStore write can never silently destroy a trusted-device credential.
export function buildDeviceStoragePayload(
  devices: SavedDevice[],
  pendingTokens?: ReadonlyMap<string, string>,
): Array<SavedDevice & { deviceToken?: string }> {
  return devices.map((device) => {
    const pendingToken = pendingTokens?.get(device.id);

    return pendingToken ? { ...device, deviceToken: pendingToken } : { ...device };
  });
}

export function persistSavedDevices(
  devices: SavedDevice[],
  pendingTokens?: ReadonlyMap<string, string>,
) {
  const payload = buildDeviceStoragePayload(devices, pendingTokens);

  AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(payload)).catch(
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
