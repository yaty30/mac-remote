import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  DEVICE_SETTINGS_STORAGE_KEY,
  DEFAULT_SENSITIVITY,
  SENSITIVITY_STORAGE_KEY,
  UNNATURAL_SCROLLING_STORAGE_KEY,
} from "./constants";

interface DeviceRemoteSettings {
  sensitivity: number;
  unnaturalScrolling: boolean;
}

type StoredDeviceRemoteSettings = Partial<DeviceRemoteSettings>;
type DeviceSettingsByKey = Record<string, StoredDeviceRemoteSettings>;

export function useRemoteSettings(deviceKey: string) {
  const normalizedDeviceKey = normalizeDeviceSettingsKey(deviceKey);
  const [fallbackSettings, setFallbackSettings] =
    useState<DeviceRemoteSettings>({
      sensitivity: DEFAULT_SENSITIVITY,
      unnaturalScrolling: false,
    });
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettingsByKey>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(DEVICE_SETTINGS_STORAGE_KEY),
      AsyncStorage.getItem(SENSITIVITY_STORAGE_KEY),
      AsyncStorage.getItem(UNNATURAL_SCROLLING_STORAGE_KEY),
    ])
      .then(([savedDeviceSettings, savedSensitivity, savedUnnaturalScrolling]) => {
        if (cancelled) {
          return;
        }

        setDeviceSettings(parseDeviceSettings(savedDeviceSettings));
        setFallbackSettings({
          sensitivity: parseSensitivity(savedSensitivity) ?? DEFAULT_SENSITIVITY,
          unnaturalScrolling: savedUnnaturalScrolling === "true",
        });
      })
      .catch(() => {
        // Ignore storage errors.
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    AsyncStorage.setItem(
      DEVICE_SETTINGS_STORAGE_KEY,
      JSON.stringify(deviceSettings),
    ).catch(() => {
      // Ignore storage errors.
    });
  }, [deviceSettings, settingsLoaded]);

  const currentSettings = resolveCurrentSettings(
    deviceSettings,
    fallbackSettings,
    normalizedDeviceKey,
  );

  function setSensitivity(value: number) {
    updateCurrentSettings({
      sensitivity: clampSensitivity(value),
    });
  }

  function setUnnaturalScrolling(value: boolean) {
    updateCurrentSettings({
      unnaturalScrolling: value,
    });
  }

  function adjustSensitivity(delta: number) {
    updateCurrentSettings({
      sensitivity: clampSensitivity(currentSettings.sensitivity + delta),
    });
  }

  function updateCurrentSettings(nextSettings: StoredDeviceRemoteSettings) {
    if (!normalizedDeviceKey) {
      setFallbackSettings((current) => ({
        ...current,
        ...nextSettings,
      }));
      return;
    }

    setDeviceSettings((current) => ({
      ...current,
      [normalizedDeviceKey]: {
        ...current[normalizedDeviceKey],
        ...nextSettings,
      },
    }));
  }

  return {
    adjustSensitivity,
    sensitivity: currentSettings.sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling: currentSettings.unnaturalScrolling,
  };
}

function resolveCurrentSettings(
  deviceSettings: DeviceSettingsByKey,
  fallbackSettings: DeviceRemoteSettings,
  deviceKey: string,
): DeviceRemoteSettings {
  const savedSettings = deviceKey ? deviceSettings[deviceKey] : undefined;

  return {
    sensitivity: savedSettings?.sensitivity ?? fallbackSettings.sensitivity,
    unnaturalScrolling:
      savedSettings?.unnaturalScrolling ?? fallbackSettings.unnaturalScrolling,
  };
}

function parseDeviceSettings(raw: string | null): DeviceSettingsByKey {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        const normalizedKey = normalizeDeviceSettingsKey(key);

        if (
          !normalizedKey ||
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return [];
        }

        const settings: StoredDeviceRemoteSettings = {};

        if ("sensitivity" in value) {
          const sensitivity = parseSensitivity(value.sensitivity);

          if (sensitivity !== null) {
            settings.sensitivity = sensitivity;
          }
        }

        if (
          "unnaturalScrolling" in value &&
          typeof value.unnaturalScrolling === "boolean"
        ) {
          settings.unnaturalScrolling = value.unnaturalScrolling;
        }

        return Object.keys(settings).length > 0
          ? [[normalizedKey, settings]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

function parseSensitivity(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  return Number.isFinite(parsed) ? clampSensitivity(parsed) : null;
}

function clampSensitivity(value: number): number {
  const next = Math.max(0.25, Math.min(3, value));
  return Math.round(next * 100) / 100;
}

function normalizeDeviceSettingsKey(value: string): string {
  return value.trim().toLowerCase();
}
