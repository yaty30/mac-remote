import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const label = "local.remote-control.dev";
const userId = process.getuid?.();
const plistPath = path.join(
  homedir(),
  "Library",
  "LaunchAgents",
  `${label}.plist`,
);

if (process.platform !== "darwin") {
  throw new Error("LaunchAgent autostart is only available on macOS.");
}

if (typeof userId !== "number") {
  throw new Error("Unable to determine the current user id.");
}

try {
  execFileSync("launchctl", ["bootout", `gui/${userId}`, plistPath], {
    stdio: "ignore",
  });
} catch {
  // The agent may already be unloaded.
}

if (existsSync(plistPath)) {
  rmSync(plistPath);
}

console.log(`Unregistered ${label}`);
