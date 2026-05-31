import { app, BrowserWindow, ipcMain, systemPreferences } from "electron";
import { createSocket } from "node:dgram";
import path from "node:path";
import QRCode from "qrcode";
import { KeyboardController } from "../mouse-control/keyboardController";
import { MouseController } from "../mouse-control/mouseController";
import type {
  DesktopStatus,
  HostMessage,
  RemoteMessage,
  ShortcutId,
} from "../types/protocol";
import { RemoteWebSocketServer } from "../websocket/server";
import { runShortcut } from "../websocket/shortcuts";

const port = Number.parseInt(process.env.REMOTE_CONTROL_PORT ?? "8787", 10);
const sensitivity = Number.parseFloat(process.env.REMOTE_SENSITIVITY ?? "1.8");
const protocolVersion = "remote-control-protocol:media-v1";
const DEFAULT_EXPO_PORT = 8081;

let mainWindow: BrowserWindow | null = null;
let mediaWindow: BrowserWindow | null = null;
let remoteServer: RemoteWebSocketServer | null = null;
let latestStatus: DesktopStatus = {
  status: "starting",
  port,
  addresses: [],
  connectedClients: 0,
};

const mouseController = new MouseController(
  Number.isFinite(sensitivity) ? sensitivity : 1.8,
);
const keyboardController = new KeyboardController();
type MediaTabId = Extract<ShortcutId, "disney" | "netflix" | "youtube">;

function isMediaTabShortcut(shortcut: ShortcutId): shortcut is MediaTabId {
  return shortcut === "disney" || shortcut === "netflix" || shortcut === "youtube";
}

function requestAccessibilityPermission(): void {
  if (process.platform !== "darwin") {
    return;
  }

  const trusted = systemPreferences.isTrustedAccessibilityClient(true);

  if (!trusted) {
    console.warn(
      [
        "Accessibility permission is required for mouse and keyboard control.",
        "Grant permission to Electron, then restart the desktop app.",
      ].join(" "),
    );
  }
}

async function getHostState(): Promise<HostMessage> {
  let volume: number | undefined;

  try {
    volume = await keyboardController.getOutputVolume();
  } catch (error) {
    console.warn("[desktop] failed to read output volume", error);
  }

  return {
    type: "hostState",
    volume,
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
    case "adjustBrightness":
      await keyboardController.adjustBrightness(message.delta);
      break;
    case "setVolume":
      await keyboardController.setVolume(message.value);
      return { type: "hostState", volume: message.value };
    case "sleep":
      await keyboardController.sleep();
      break;
    case "shortcut":
      if (isMediaTabShortcut(message.shortcut)) {
        showMediaWindow(message.shortcut);
      } else {
        await runShortcut(message.shortcut);
      }
      break;
    case "typeText":
      await keyboardController.typeText(message.text);
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
    width: 520,
    height: 780,
    resizable: false,
    title: "Remote Control Desktop",
    backgroundColor: "#0c0d10",
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

function createMediaWindow(): void {
  mediaWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 920,
    minHeight: 620,
    title: "Media Browser",
    frame: false,
    fullscreen: true,
    backgroundColor: "#090b10",
    webPreferences: {
      preload: path.join(__dirname, "mediaPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mediaWindow.loadFile(path.join(__dirname, "media.html"));

  const sendMaximizedState = () => {
    mediaWindow?.webContents.send(
      "media-window:maximized",
      mediaWindow.isMaximized(),
    );
  };

  mediaWindow.on("maximize", sendMaximizedState);
  mediaWindow.on("unmaximize", sendMaximizedState);
  mediaWindow.webContents.once("did-finish-load", sendMaximizedState);

  mediaWindow.on("closed", () => {
    mediaWindow = null;
  });
}

function showMediaWindow(tab: MediaTabId = "youtube"): void {
  if (!mediaWindow || mediaWindow.isDestroyed()) {
    createMediaWindow();
  }

  mediaWindow?.show();
  mediaWindow?.focus();

  if (mediaWindow?.webContents.isLoading()) {
    mediaWindow.webContents.once("did-finish-load", () => {
      mediaWindow?.webContents.send("media:switch-tab", tab);
    });
    return;
  }

  mediaWindow?.webContents.send("media:switch-tab", tab);
}

async function publishStatus(status: DesktopStatus): Promise<void> {
  latestStatus = await withPairingQr(status);
  mainWindow?.webContents.send("status:update", latestStatus);
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
    url: pairingUrl,
  });

  return {
    ...status,
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
  const host = explicitHost || (await resolveLanAddress(addresses)) || "127.0.0.1";
  const expoPort = await findExpoPort();

  return `exp://${host}:${expoPort}`;
}

async function resolveLanAddress(addresses: string[]): Promise<string | null> {
  return (await getDefaultRouteAddress(addresses)) || chooseLanAddress(addresses);
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

app.whenReady().then(() => {
  console.log(`[desktop] ${protocolVersion}`);
  requestAccessibilityPermission();
  ipcMain.handle("status:get", () => latestStatus);
  ipcMain.handle("media-window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("media-window:toggle-maximize", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow) {
      return false;
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }

    return targetWindow.isMaximized();
  });
  ipcMain.handle("media-window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("media-window:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  remoteServer = new RemoteWebSocketServer(port, handleRemoteMessage, getHostState);
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
  createMediaWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createMediaWindow();
    }
  });
});

app.on("before-quit", async () => {
  if (remoteServer) {
    await remoteServer.close();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
