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

function runAppleScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function openSafariTabOnce(url: string, urlNeedle: string): Promise<void> {
  if (process.platform !== "darwin") {
    await openMac(url);
    return;
  }

  const script = `
tell application "Safari"
  activate
  repeat with safariWindow in windows
    repeat with safariTab in tabs of safariWindow
      if (URL of safariTab contains "${escapeAppleScriptString(urlNeedle)}") then
        set current tab of safariWindow to safariTab
        set index of safariWindow to 1
        return
      end if
    end repeat
  end repeat
  open location "${escapeAppleScriptString(url)}"
end tell
`;

  await runAppleScript(script);
}

export async function runWebsiteShortcut(url: string): Promise<void> {
  await openSafariTabOnce(url, getUrlNeedle(url));
}

export async function runShortcut(shortcut: ShortcutId): Promise<void> {
  switch (shortcut) {
    case "netflix":
      await openSafariTabOnce("https://www.netflix.com", "netflix.com");
      break;
    case "disney":
      await openSafariTabOnce("https://www.disneyplus.com", "disneyplus.com");
      break;
    case "amazon":
      await openMac("Prime Video", ["-a"]);
      break;
    case "youtube":
      await openSafariTabOnce("https://www.youtube.com", "youtube.com");
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

function getUrlNeedle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
