import { app, BrowserWindow, ipcMain, systemPreferences } from "electron";
import path from "node:path";
import { KeyboardController } from "../mouse-control/keyboardController";
import { MouseController } from "../mouse-control/mouseController";
import type { DesktopStatus, RemoteMessage } from "../types/protocol";
import { RemoteWebSocketServer } from "../websocket/server";
import { runShortcut } from "../websocket/shortcuts";

const port = Number.parseInt(process.env.REMOTE_CONTROL_PORT ?? "8787", 10);
const sensitivity = Number.parseFloat(process.env.REMOTE_SENSITIVITY ?? "1.8");
const protocolVersion = "remote-control-protocol:media-v1";

let mainWindow: BrowserWindow | null = null;
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

async function handleRemoteMessage(message: RemoteMessage): Promise<void> {
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
      break;
    case "shortcut":
      await runShortcut(message.shortcut);
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
    height: 620,
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

function publishStatus(status: DesktopStatus): void {
  latestStatus = status;
  mainWindow?.webContents.send("status:update", status);
}

app.whenReady().then(() => {
  console.log(`[desktop] ${protocolVersion}`);
  requestAccessibilityPermission();
  ipcMain.handle("status:get", () => latestStatus);

  remoteServer = new RemoteWebSocketServer(port, handleRemoteMessage);
  publishStatus(remoteServer.getStatus());

  remoteServer.on("status", publishStatus);
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
  if (remoteServer) {
    await remoteServer.close();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
