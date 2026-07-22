import type { CustomShortcut, PresetIconKey } from "./types";
import type { ShortcutId } from "../../types/protocol";

const PRESET_ICON_KEYS = new Set<PresetIconKey>([
  "amazon",
  "disney",
  "netflix",
  "spotify",
  "youtube",
]);
const SHORTCUT_IDS = new Set<ShortcutId>([
  "amazon",
  "disney",
  "netflix",
  "spotify",
  "youtube",
]);

export function parseCustomShortcuts(raw: string): CustomShortcut[] {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): CustomShortcut[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("id" in item) ||
        !("name" in item) ||
        !("url" in item) ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.url !== "string"
      ) {
        return [];
      }

      const url = normalizeWebsiteUrl(item.url);

      if (!item.name.trim() || !url) {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name.trim().slice(0, 40),
          url,
          iconUri:
            "iconUri" in item && typeof item.iconUri === "string"
              ? item.iconUri
              : undefined,
          iconKey:
            "iconKey" in item &&
            typeof item.iconKey === "string" &&
            PRESET_ICON_KEYS.has(item.iconKey as PresetIconKey)
              ? (item.iconKey as PresetIconKey)
              : undefined,
          shortcutId:
            "shortcutId" in item &&
            typeof item.shortcutId === "string" &&
            SHORTCUT_IDS.has(item.shortcutId as ShortcutId)
              ? (item.shortcutId as ShortcutId)
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function normalizeWebsiteUrl(value: string): string | null {
  const cleanValue = value.trim();

  if (cleanValue.length === 0) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(cleanValue)
    ? cleanValue
    : `https://${cleanValue}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
