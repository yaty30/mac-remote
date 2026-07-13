import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  screen as electronScreen,
  shell,
  systemPreferences,
} from "electron";
import { execFileSync, spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { KeyboardController } from "../mouse-control/keyboardController";
import { MouseController } from "../mouse-control/mouseController";
import type {
  DesktopStatus,
  HostDisplayInfo,
  HostMessage,
  RemoteMessage,
} from "../types/protocol";
import { RemoteWebSocketServer } from "../websocket/server";
import { runShortcut, runWebsiteShortcut } from "../websocket/shortcuts";

const port = Number.parseInt(process.env.REMOTE_CONTROL_PORT ?? "8787", 10);
const sensitivity = Number.parseFloat(process.env.REMOTE_SENSITIVITY ?? "1.8");
const protocolVersion = "remote-control-protocol:media-v1";
const DEFAULT_EXPO_PORT = 8081;
const hostName = getDeviceName();
const startupAgentLabel = "local.remote-control.dev";
const mobileServerDefaultCommand = "npm run start -- --clear";

let mainWindow: BrowserWindow | null = null;
let remoteServer: RemoteWebSocketServer | null = null;
let mobileServerProcess: ReturnType<typeof spawn> | null = null;
let latestStatus: DesktopStatus = {
  status: "starting",
  hostName,
  protocolVersion,
  platform: process.platform,
  port,
  addresses: [],
  connectedClients: 0,
};

const mouseController = new MouseController(
  Number.isFinite(sensitivity) ? sensitivity : 1.8,
);
const keyboardController = new KeyboardController();

function getAccessibilityTarget(): { name: string; path: string } | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  const executablePath = process.execPath;
  const appBundlePath = getAppBundlePath(executablePath);

  return {
    name: appBundlePath ? path.basename(appBundlePath) : path.basename(executablePath),
    path: appBundlePath ?? executablePath,
  };
}

function getAppBundlePath(executablePath: string): string | undefined {
  const bundleMarker = ".app/Contents/MacOS/";
  const markerIndex = executablePath.indexOf(bundleMarker);

  if (markerIndex === -1) {
    return undefined;
  }

  return executablePath.slice(0, markerIndex + ".app".length);
}

function checkAccessibilityPermission(): void {
  if (process.platform !== "darwin") {
    return;
  }

  const trusted = systemPreferences.isTrustedAccessibilityClient(false);

  if (!trusted) {
    const target = getAccessibilityTarget();
    console.warn(
      [
        "Accessibility permission is required for mouse and keyboard control.",
        `Grant permission to ${target?.name ?? "this app"}, then restart the desktop app.`,
        target ? `Target: ${target.path}` : "",
      ].join(" "),
    );
  }
}

function getAccessibilityTrusted(): boolean | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  return systemPreferences.isTrustedAccessibilityClient(false);
}

function getStartupSettings(): { available: boolean; enabled: boolean } {
  if (process.platform !== "darwin") {
    return {
      available: false,
      enabled: false,
    };
  }

  return {
    available: true,
    enabled: existsSync(getStartupPlistPath()),
  };
}

function setStartupEnabled(enabled: boolean): { available: boolean; enabled: boolean } {
  if (process.platform !== "darwin") {
    return getStartupSettings();
  }

  if (enabled) {
    writeStartupAgent();
  } else {
    removeStartupAgent();
  }

  return getStartupSettings();
}

function writeStartupAgent(): void {
  const launchAgentsDir = getLaunchAgentsDir();
  const logsDir = path.join(homedir(), "Library", "Logs");
  const plistPath = getStartupPlistPath();

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  writeFileSync(
    plistPath,
    buildStartupPlist(getStartupWorkingDirectory(), logsDir),
    "utf8",
  );
}

function removeStartupAgent(): void {
  const plistPath = getStartupPlistPath();

  if (existsSync(plistPath)) {
    rmSync(plistPath);
  }
}

function getLaunchAgentsDir(): string {
  return path.join(homedir(), "Library", "LaunchAgents");
}

function getStartupPlistPath(): string {
  return path.join(getLaunchAgentsDir(), `${startupAgentLabel}.plist`);
}

function getStartupWorkingDirectory(): string {
  const appPath = app.getAppPath();

  if (path.basename(appPath) === "desktop") {
    return path.dirname(appPath);
  }

  if (path.basename(process.cwd()) === "desktop") {
    return path.dirname(process.cwd());
  }

  return process.cwd();
}

function buildStartupPlist(workingDirectory: string, logsDir: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(startupAgentLabel)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>npm run dev</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logsDir, `${startupAgentLabel}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logsDir, `${startupAgentLabel}.err.log`))}</string>
</dict>
</plist>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function startMobileServer(): void {
  if (process.env.REMOTE_MOBILE_SERVER === "0") {
    console.log("[mobile-server] disabled by REMOTE_MOBILE_SERVER=0");
    return;
  }

  if (mobileServerProcess) {
    return;
  }

  const mobileDirectory = resolveMobileServerDirectory();

  if (!mobileDirectory) {
    console.warn(
      "[mobile-server] mobile workspace not found; set REMOTE_MOBILE_DIR to start Expo automatically",
    );
    return;
  }

  const command =
    process.env.REMOTE_MOBILE_COMMAND?.trim() || mobileServerDefaultCommand;
  const logsDirectory = app.getPath("logs");
  mkdirSync(logsDirectory, { recursive: true });

  const stdoutFd = openSync(path.join(logsDirectory, "mobile-server.out.log"), "a");
  const stderrFd = openSync(path.join(logsDirectory, "mobile-server.err.log"), "a");

  console.log(`[mobile-server] starting from ${mobileDirectory}`);

  try {
    mobileServerProcess = spawn(resolveShellCommand(), resolveShellArgs(command), {
      cwd: mobileDirectory,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        BROWSER: "none",
        EXPO_NO_TELEMETRY: "1",
      },
      stdio: ["ignore", stdoutFd, stderrFd],
    });
  } catch (error) {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    console.error("[mobile-server] failed to start", error);
    return;
  }

  mobileServerProcess.once("error", (error) => {
    console.error("[mobile-server] failed to start", error);
  });

  mobileServerProcess.once("close", (code, signal) => {
    console.log(
      `[mobile-server] exited with code ${code ?? "null"} signal ${
        signal ?? "null"
      }`,
    );
    closeSync(stdoutFd);
    closeSync(stderrFd);
    mobileServerProcess = null;
  });
}

function resolveShellCommand(): string {
  return process.platform === "win32" ? "cmd.exe" : "/bin/zsh";
}

function resolveShellArgs(command: string): string[] {
  return process.platform === "win32"
    ? ["/d", "/s", "/c", command]
    : ["-lc", command];
}

function resolveMobileServerDirectory(): string | null {
  const explicitDirectory = process.env.REMOTE_MOBILE_DIR?.trim();

  if (explicitDirectory && isMobileProjectDirectory(explicitDirectory)) {
    return explicitDirectory;
  }

  return findWorkspaceMobileDirectory() || findBundledMobileDirectory();
}

function findWorkspaceMobileDirectory(): string | null {
  const startDirectories = [
    process.cwd(),
    app.getAppPath(),
    process.resourcesPath,
    __dirname,
  ];

  for (const startDirectory of startDirectories) {
    let currentDirectory = path.resolve(startDirectory);

    for (let depth = 0; depth < 10; depth += 1) {
      if (isWorkspaceRootDirectory(currentDirectory)) {
        const candidate = path.join(currentDirectory, "mobile");
        return candidate;
      }

      const parentDirectory = path.dirname(currentDirectory);

      if (parentDirectory === currentDirectory) {
        break;
      }

      currentDirectory = parentDirectory;
    }
  }

  return null;
}

function isWorkspaceRootDirectory(directory: string): boolean {
  return (
    existsSync(path.join(directory, "package.json")) &&
    existsSync(path.join(directory, "desktop", "package.json")) &&
    isMobileProjectDirectory(path.join(directory, "mobile"))
  );
}

function findBundledMobileDirectory(): string | null {
  const candidate = path.join(process.resourcesPath, "mobile");
  return isMobileProjectDirectory(candidate) ? candidate : null;
}

function isMobileProjectDirectory(directory: string): boolean {
  return (
    existsSync(path.join(directory, "package.json")) &&
    existsSync(path.join(directory, "app.json"))
  );
}

async function stopMobileServer(): Promise<void> {
  const child = mobileServerProcess;

  if (!child) {
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    child.once("close", finish);

    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, "SIGTERM");
      } else {
        child.kill("SIGTERM");
      }
    } catch (error) {
      console.warn("[mobile-server] failed to stop gracefully", error);
      finish();
      return;
    }

    setTimeout(() => {
      try {
        if (process.platform !== "win32" && child.pid) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // Process already exited.
      }

      finish();
    }, 2500).unref();
  });
}

async function getHostState(): Promise<HostMessage> {
  let brightness: number | undefined;
  let volume: number | undefined;

  try {
    brightness = await keyboardController.getDisplayBrightness();
  } catch (error) {
    console.warn("[desktop] failed to read display brightness", error);
  }

  try {
    volume = await keyboardController.getOutputVolume();
  } catch (error) {
    console.warn("[desktop] failed to read output volume", error);
  }

  return {
    type: "hostState",
    hostName,
    brightness,
    volume,
    display: getCurrentDisplayInfo(),
  };
}

async function handleRemoteMessage(
  message: RemoteMessage,
): Promise<HostMessage | void> {
  switch (message.type) {
    case "moveMouse":
      await mouseController.moveRelative(message.dx, message.dy);
      break;
    case "leftClick":
      await mouseController.leftClick();
      break;
    case "doubleClick":
      await mouseController.doubleClick();
      break;
    case "rightClick":
      await mouseController.rightClick();
      break;
    case "scroll":
      await mouseController.scroll(message.dx, message.dy);
      break;
    case "zoom":
      await keyboardController.zoom(message.direction);
      break;
    case "swipeSpaces":
      await keyboardController.switchSpace(message.direction);
      break;
    case "requestHostState":
      return await getHostState();
    case "adjustBrightness": {
      const display = getCurrentDisplayInfo();
      if (!display.brightnessAdjustable) {
        return await getHostState();
      }

      await keyboardController.adjustBrightness(message.delta);
      return await getHostState();
    }
    case "setBrightness": {
      const display = getCurrentDisplayInfo();
      if (!display.brightnessAdjustable) {
        return await getHostState();
      }

      await keyboardController.setBrightness(message.value);
      return await getHostState();
    }
    case "setVolume": {
      const display = getCurrentDisplayInfo();
      if (!display.volumeAdjustable) {
        return await getHostState();
      }

      await keyboardController.setVolume(message.value);
      return await getHostState();
    }
    case "sleep":
      await keyboardController.sleep();
      break;
    case "restartHost":
      await keyboardController.restartHost();
      break;
    case "shortcut":
      await runShortcut(message.shortcut);
      break;
    case "websiteShortcut":
      await runWebsiteShortcut(message.url);
      break;
    case "typeText":
      await keyboardController.typeText(message.text);
      break;
    case "pasteText": {
      clipboard.writeText(message.text);
      await keyboardController.textCommand("paste");
      break;
    }
    case "textCommand":
      await keyboardController.textCommand(message.command);
      break;
    case "pressKey":
      await keyboardController.pressKey(message.key);
      break;
    default: {
      const exhaustive: never = message;
      throw new Error(`Unsupported message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1010,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    resizable: true,
    frame: false,
    title: "Mac Remote",
    backgroundColor: "#080808",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.once("did-finish-load", () => {
    mainWindow?.webContents.send("status:update", latestStatus);
  });

  if (process.env.REMOTE_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

async function publishStatus(status: DesktopStatus): Promise<void> {
  latestStatus = await withPairingQr(withDesktopContext(status));
  mainWindow?.webContents.send("status:update", latestStatus);
}

function withDesktopContext(status: DesktopStatus): DesktopStatus {
  const accessibilityTarget = getAccessibilityTarget();

  return {
    ...status,
    hostName,
    protocolVersion,
    platform: process.platform,
    accessibilityTrusted: getAccessibilityTrusted(),
    accessibilityTargetName: accessibilityTarget?.name,
    accessibilityTargetPath: accessibilityTarget?.path,
    display: getCurrentDisplayInfo(),
  };
}

async function withPairingQr(status: DesktopStatus): Promise<DesktopStatus> {
  const address = await resolveLanAddress(status.addresses);

  if (!address) {
    return status;
  }

  const pairingUrl = `ws://${address}:${status.port}`;
  const expoUrl = await resolveExpoUrl(status.addresses);
  const payload = JSON.stringify({
    type: "remote-control",
    name: hostName,
    url: pairingUrl,
  });

  return {
    ...status,
    hostName,
    pairingUrl,
    expoUrl,
    pairingQrDataUrl: await QRCode.toDataURL(payload, {
      margin: 1,
      scale: 7,
      color: {
        dark: "#0b0d12",
        light: "#ffffff",
      },
    }),
    expoQrDataUrl: await QRCode.toDataURL(expoUrl, {
      margin: 1,
      scale: 7,
      color: {
        dark: "#0b0d12",
        light: "#ffffff",
      },
    }),
  };
}

async function resolveExpoUrl(addresses: string[]): Promise<string> {
  const explicitUrl = process.env.REMOTE_EXPO_URL?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const explicitHost = process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim();
  const host =
    explicitHost || (await resolveLanAddress(addresses)) || "127.0.0.1";
  const expoPort = await findExpoPort();

  return `exp://${host}:${expoPort}`;
}

async function resolveLanAddress(addresses: string[]): Promise<string | null> {
  return (
    (await getDefaultRouteAddress(addresses)) || chooseLanAddress(addresses)
  );
}

async function findExpoPort(): Promise<number> {
  const portCandidates = [
    DEFAULT_EXPO_PORT,
    DEFAULT_EXPO_PORT + 1,
    DEFAULT_EXPO_PORT + 2,
    DEFAULT_EXPO_PORT + 3,
  ];

  for (const candidate of portCandidates) {
    if (await isExpoServerRunning(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_EXPO_PORT;
}

async function isExpoServerRunning(candidatePort: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${candidatePort}/status`, {
      signal: AbortSignal.timeout(300),
    });
    const text = await response.text();
    return text.includes("packager-status:running");
  } catch {
    return false;
  }
}

function getDefaultRouteAddress(addresses: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const finish = (address: string | null) => {
      socket.close();
      resolve(address && addresses.includes(address) ? address : null);
    };

    socket.once("error", () => finish(null));
    socket.connect(53, "1.1.1.1", () => {
      const localAddress = socket.address();
      finish(
        typeof localAddress === "object" && "address" in localAddress
          ? localAddress.address
          : null,
      );
    });
  });
}

function chooseLanAddress(addresses: string[]): string | null {
  return (
    [...addresses].sort((left, right) => {
      const leftScore = getAddressPriority(left);
      const rightScore = getAddressPriority(right);

      return rightScore - leftScore || right.localeCompare(left);
    })[0] ?? null
  );
}

function getAddressPriority(address: string): number {
  if (address.startsWith("192.168.")) {
    return 5;
  }

  if (address.startsWith("172.")) {
    return 4;
  }

  if (address.startsWith("10.")) {
    return 3;
  }

  if (address.startsWith("100.")) {
    return 2;
  }

  return 1;
}

function getDeviceName(): string {
  const override = process.env.REMOTE_DEVICE_NAME?.trim();

  if (override) {
    return override.slice(0, 80);
  }

  if (process.platform === "darwin") {
    for (const key of ["ComputerName", "LocalHostName"]) {
      try {
        const value = execFileSync("scutil", ["--get", key], {
          encoding: "utf8",
          timeout: 500,
        }).trim();

        if (value) {
          return value.slice(0, 80);
        }
      } catch {
        // fall back to the system hostname below
      }
    }
  }

  return (
    hostname()
      .replace(/\.local$/i, "")
      .slice(0, 80) || "Desktop"
  );
}

function getCurrentDisplayInfo(): HostDisplayInfo {
  const cursorPoint = electronScreen.getCursorScreenPoint();
  const display = electronScreen.getDisplayNearestPoint(cursorPoint);
  const name = getDisplayName(display);
  const isTv = isTvDisplayName(name);

  return {
    id: display.id,
    name,
    isTv,
    brightnessAdjustable: process.platform === "darwin" && !isTv,
    volumeAdjustable: !isTv,
  };
}

function getDisplayName(display: Electron.Display): string {
  const label = display.label.trim();

  if (label) {
    return label.slice(0, 80);
  }

  const { width, height } = display.size;
  return `${display.internal ? "Built-in" : "External"} Display ${width}x${height}`;
}

function isTvDisplayName(name: string): boolean {
  return /\b(tv|television|oled|qled|bravia|roku)\b/i.test(name);
}

app.whenReady().then(() => {
  console.log(`[desktop] ${protocolVersion}`);
  checkAccessibilityPermission();
  startMobileServer();
  ipcMain.handle("status:get", () => withDesktopContext(latestStatus));
  ipcMain.handle("clipboard:write", (_event, text: unknown) => {
    if (typeof text !== "string") {
      return false;
    }

    clipboard.writeText(text.slice(0, 2048));
    return true;
  });
  ipcMain.handle("settings:accessibility", () => {
    if (process.platform !== "darwin") {
      return false;
    }

    if (getAccessibilityTrusted()) {
      return true;
    }

    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
    return true;
  });
  ipcMain.handle("startup:get", () => getStartupSettings());
  ipcMain.handle("startup:set", (_event, enabled: unknown) => {
    if (typeof enabled !== "boolean") {
      throw new Error("Invalid startup setting");
    }

    return setStartupEnabled(enabled);
  });
  ipcMain.handle("window:control", (_event, action: unknown) => {
    if (!mainWindow) {
      return false;
    }

    if (action === "minimize") {
      mainWindow.minimize();
      return true;
    }

    if (action === "maximize") {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }

      return true;
    }

    if (action === "close") {
      mainWindow.close();
      return true;
    }

    return false;
  });

  remoteServer = new RemoteWebSocketServer(
    port,
    handleRemoteMessage,
    getHostState,
  );
  publishStatus(remoteServer.getStatus()).catch((error) => {
    console.error("[desktop] failed to publish initial status", error);
  });

  remoteServer.on("status", (status) => {
    publishStatus(status).catch((error) => {
      console.error("[desktop] failed to render pairing QR", error);
    });
  });
  remoteServer.on("error", (error) => {
    console.error("[remote-server]", error);
    publishStatus({
      ...latestStatus,
      status: "error",
      errorMessage: error.message,
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  await stopMobileServer();

  if (remoteServer) {
    await remoteServer.close();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
