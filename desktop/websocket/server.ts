import { EventEmitter } from "node:events";
import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import type { DesktopStatus, HostMessage, RemoteMessage } from "../types/protocol";

type MessageHandler = (message: RemoteMessage) => Promise<HostMessage | void>;
type HostStateProvider = () => Promise<HostMessage>;

interface RemoteServerEvents {
  status: [DesktopStatus];
  error: [Error];
}

export class RemoteWebSocketServer extends EventEmitter<RemoteServerEvents> {
  private readonly server: WebSocketServer;
  private connectedClients = 0;
  private currentStatus: DesktopStatus;

  constructor(
    private readonly port: number,
    private readonly onMessage: MessageHandler,
    private readonly getHostState?: HostStateProvider,
  ) {
    super();

    this.server = new WebSocketServer({ port, host: "0.0.0.0" });
    this.currentStatus = this.buildStatus("waiting");
    this.attachHandlers();
  }

  getStatus(): DesktopStatus {
    return this.currentStatus;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private attachHandlers(): void {
    this.server.on("listening", () => this.publishStatus());

    this.server.on("connection", (socket) => {
      this.connectedClients += 1;
      this.publishStatus();
      this.sendHostState(socket).catch((error) => {
        this.emit(
          "error",
          error instanceof Error ? error : new Error(String(error)),
        );
      });

      socket.on("message", async (raw) => {
        try {
          const message = parseRemoteMessage(raw.toString());
          const response = await this.onMessage(message);

          if (response) {
            sendJson(socket, response);
          }
        } catch (error) {
          this.emit(
            "error",
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });

      socket.on("close", () => {
        this.connectedClients = Math.max(0, this.connectedClients - 1);
        this.publishStatus();
      });
    });

    this.server.on("error", (error) => this.emit("error", error));
  }

  private async sendHostState(socket: WebSocket): Promise<void> {
    if (!this.getHostState) {
      return;
    }

    sendJson(socket, await this.getHostState());
  }

  private publishStatus(): void {
    this.currentStatus = this.buildStatus(
      this.connectedClients > 0 ? "connected" : "waiting",
    );
    this.emit("status", this.currentStatus);
  }

  private buildStatus(status: DesktopStatus["status"]): DesktopStatus {
    return {
      status,
      port: this.port,
      addresses: getLocalIPv4Addresses(),
      connectedClients: this.connectedClients,
    };
  }
}

function parseRemoteMessage(raw: string): RemoteMessage {
  const data = JSON.parse(raw) as unknown;

  if (!isRecord(data) || typeof data.type !== "string") {
    throw new Error("Invalid remote message");
  }

  if (data.type === "moveMouse") {
    if (typeof data.dx !== "number" || typeof data.dy !== "number") {
      throw new Error("Invalid moveMouse payload");
    }

    return {
      type: "moveMouse",
      dx: clampDelta(data.dx),
      dy: clampDelta(data.dy),
    };
  }

  if (data.type === "leftClick") {
    return { type: "leftClick" };
  }

  if (data.type === "doubleClick") {
    return { type: "doubleClick" };
  }

  if (data.type === "rightClick") {
    return { type: "rightClick" };
  }

  if (data.type === "scroll") {
    if (typeof data.dx !== "number" || typeof data.dy !== "number") {
      throw new Error("Invalid scroll payload");
    }

    return {
      type: "scroll",
      dx: clampScroll(data.dx),
      dy: clampScroll(data.dy),
    };
  }

  if (data.type === "zoom") {
    if (data.direction === "in" || data.direction === "out") {
      return { type: "zoom", direction: data.direction };
    }

    throw new Error("Invalid zoom payload");
  }

  if (data.type === "swipeSpaces") {
    if (data.direction === "left" || data.direction === "right") {
      return { type: "swipeSpaces", direction: data.direction };
    }

    throw new Error("Invalid swipeSpaces payload");
  }

  if (data.type === "requestHostState") {
    return { type: "requestHostState" };
  }

  if (data.type === "adjustBrightness") {
    if (data.delta === -1 || data.delta === 1) {
      return { type: "adjustBrightness", delta: data.delta };
    }

    throw new Error("Invalid adjustBrightness payload");
  }

  if (data.type === "setVolume") {
    if (typeof data.value !== "number") {
      throw new Error("Invalid setVolume payload");
    }

    return {
      type: "setVolume",
      value: clampPercent(data.value),
    };
  }

  if (data.type === "sleep") {
    return { type: "sleep" };
  }

  if (data.type === "restartHost") {
    return { type: "restartHost" };
  }

  if (data.type === "shortcut") {
    if (
      data.shortcut === "netflix" ||
      data.shortcut === "disney" ||
      data.shortcut === "amazon" ||
      data.shortcut === "youtube" ||
      data.shortcut === "spotify"
    ) {
      return {
        type: "shortcut",
        shortcut: data.shortcut,
      };
    }

    throw new Error("Invalid shortcut payload");
  }

  if (data.type === "websiteShortcut") {
    if (typeof data.name !== "string" || typeof data.url !== "string") {
      throw new Error("Invalid websiteShortcut payload");
    }

    const name = data.name.trim().slice(0, 40);
    const url = normalizeWebsiteUrl(data.url);

    if (!name || !url) {
      throw new Error("Invalid websiteShortcut payload");
    }

    return {
      type: "websiteShortcut",
      name,
      url,
    };
  }

  if (data.type === "typeText") {
    if (typeof data.text !== "string") {
      throw new Error("Invalid typeText payload");
    }

    return {
      type: "typeText",
      text: data.text.slice(0, 128),
    };
  }

  if (data.type === "textCommand") {
    if (
      data.command === "selectAll" ||
      data.command === "copy" ||
      data.command === "paste" ||
      data.command === "clear" ||
      data.command === "reload" ||
      data.command === "browserBack" ||
      data.command === "browserForward"
    ) {
      return {
        type: "textCommand",
        command: data.command,
      };
    }

    throw new Error("Invalid textCommand payload");
  }

  if (data.type === "pressKey") {
    if (
      data.key === "backspace" ||
      data.key === "enter" ||
      data.key === "leftArrow" ||
      data.key === "rightArrow"
    ) {
      return {
        type: "pressKey",
        key: data.key,
      };
    }

    throw new Error("Invalid pressKey payload");
  }

  throw new Error(`Unsupported message type: ${data.type}`);
}

function sendJson(socket: WebSocket, message: HostMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function clampDelta(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-80, Math.min(80, value));
}

function clampScroll(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-200, Math.min(200, value));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeWebsiteUrl(value: string): string | null {
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

    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function getLocalIPv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
