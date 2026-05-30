import { execFile } from "node:child_process";
import type { ShortcutId } from "../types/protocol";

function openMac(target: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", [...args, target], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function runShortcut(shortcut: ShortcutId): Promise<void> {
  switch (shortcut) {
    case "netflix":
      await openMac("https://www.netflix.com", ["-a", "Safari"]);
      break;
    case "disney":
      await openMac("https://www.disneyplus.com", ["-a", "Safari"]);
      break;
    case "amazon":
      await openMac("https://www.primevideo.com", ["-a", "Safari"]);
      break;
    case "youtube":
      await openMac("https://www.youtube.com", ["-a", "Safari"]);
      break;
    case "spotify":
      await openMac("Spotify", ["-a"]);
      break;
    default: {
      const exhaustive: never = shortcut;
      throw new Error(`Unsupported shortcut: ${exhaustive}`);
    }
  }
}
