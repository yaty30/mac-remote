import type { CustomShortcut } from "./types";

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
