import { sanitizeHostName } from "./deviceUtils";
import type { PairingPayload } from "./types";

export function parsePairingPayload(raw: string): PairingPayload | null {
  const text = raw.trim();

  if (text.startsWith("ws://") || text.startsWith("wss://")) {
    return { url: text };
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      "url" in parsed &&
      parsed.type === "remote-control" &&
      typeof parsed.url === "string"
    ) {
      const hostName =
        ("hostName" in parsed && sanitizeHostName(parsed.hostName)) ||
        ("name" in parsed && sanitizeHostName(parsed.name)) ||
        undefined;

      return {
        url: parsed.url,
        hostName,
      };
    }
  } catch {
    return null;
  }

  return null;
}
