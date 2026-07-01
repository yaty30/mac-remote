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

async function openChromeTabOnce(url: string, urlNeedle: string): Promise<void> {
  if (process.platform !== "darwin") {
    await openMac(url);
    return;
  }

  const script = `
tell application "Google Chrome"
  activate
  set targetUrl to "${escapeAppleScriptString(url)}"
  set targetNeedle to "${escapeAppleScriptString(urlNeedle)}"
  repeat with chromeWindow in windows
    set tabIndex to 1
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab contains targetNeedle) then
        set active tab index of chromeWindow to tabIndex
        set index of chromeWindow to 1
        return
      end if
      set tabIndex to tabIndex + 1
    end repeat
  end repeat
  open location targetUrl
end tell
`;

  try {
    await runAppleScript(script);
  } catch {
    await openMac(url, ["-a", "Google Chrome"]);
  }
}

export async function runWebsiteShortcut(url: string): Promise<void> {
  await openChromeTabOnce(url, getUrlNeedle(url));
}

export async function runShortcut(shortcut: ShortcutId): Promise<void> {
  switch (shortcut) {
    case "netflix":
      await openChromeTabOnce("https://www.netflix.com", "netflix.com");
      break;
    case "disney":
      await openChromeTabOnce("https://www.disneyplus.com", "disneyplus.com");
      break;
    case "amazon":
      await openMac("Prime Video", ["-a"]);
      break;
    case "youtube":
      await openChromeTabOnce("https://www.youtube.com", "youtube.com");
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
