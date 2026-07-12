import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const label = "local.remote-control.dev";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const userId = process.getuid?.();
const launchAgentsDir = path.join(homedir(), "Library", "LaunchAgents");
const logsDir = path.join(homedir(), "Library", "Logs");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);

if (process.platform !== "darwin") {
  throw new Error("LaunchAgent autostart is only available on macOS.");
}

if (typeof userId !== "number") {
  throw new Error("Unable to determine the current user id.");
}

mkdirSync(launchAgentsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>npm run dev</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(repoRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logsDir, `${label}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logsDir, `${label}.err.log`))}</string>
</dict>
</plist>
`;

writeFileSync(plistPath, plist, "utf8");

try {
  execFileSync("launchctl", ["bootout", `gui/${userId}`, plistPath], {
    stdio: "ignore",
  });
} catch {
  // The agent may not be loaded yet.
}

execFileSync("launchctl", ["bootstrap", `gui/${userId}`, plistPath], {
  stdio: "inherit",
});

console.log(`Registered ${label}`);
console.log(plistPath);

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
