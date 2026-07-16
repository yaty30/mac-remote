import { EventEmitter } from "node:events";
import { networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { WebSocket, WebSocketServer } from "ws";
import type { DesktopStatus, HostMessage, RemoteMessage } from "../types/protocol";

type MessageHandler = (message: RemoteMessage) => Promise<HostMessage | void>;
type HostStateProvider = () => Promise<HostMessage>;
type ClientLatencyState = {
  latencyMs?: number;
  pendingId?: string;
  pendingStartedAt?: number;
  timer: ReturnType<typeof setInterval>;
};

interface RemoteServerEvents {
  status: [DesktopStatus];
  error: [Error];
}

export class RemoteWebSocketServer extends EventEmitter<RemoteServerEvents> {
  private readonly server: WebSocketServer;
  private connectedClients = 0;
  private currentStatus: DesktopStatus;
  private readonly clientLatency = new Map<WebSocket, ClientLatencyState>();

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
    for (const state of this.clientLatency.values()) {
      clearInterval(state.timer);
    }
    this.clientLatency.clear();

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
      this.startLatencyMonitoring(socket);
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

          if (message.type === "ping") {
            sendJson(socket, { type: "pong", id: message.id });
            return;
          }

          if (message.type === "pong") {
            this.recordLatency(socket, message.id);
            return;
          }

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
        this.stopLatencyMonitoring(socket);
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
      latencyMs: this.getAverageLatency(),
    };
  }

  private startLatencyMonitoring(socket: WebSocket): void {
    const state: ClientLatencyState = {
      timer: setInterval(() => this.sendLatencyPing(socket), 2000),
    };

    this.clientLatency.set(socket, state);
    this.sendLatencyPing(socket);
  }

  private stopLatencyMonitoring(socket: WebSocket): void {
    const state = this.clientLatency.get(socket);

    if (!state) {
      return;
    }

    clearInterval(state.timer);
    this.clientLatency.delete(socket);
  }

  private sendLatencyPing(socket: WebSocket): void {
    const state = this.clientLatency.get(socket);

    if (!state || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.pendingId = id;
    state.pendingStartedAt = performance.now();
    sendJson(socket, { type: "ping", id });
  }

  private recordLatency(socket: WebSocket, id: string): void {
    const state = this.clientLatency.get(socket);

    if (!state || state.pendingId !== id || state.pendingStartedAt === undefined) {
      return;
    }

    state.latencyMs = Math.max(
      0,
      Math.round(performance.now() - state.pendingStartedAt),
    );
    state.pendingId = undefined;
    state.pendingStartedAt = undefined;
    this.publishStatus();
  }

  private getAverageLatency(): number | undefined {
    const latencies = [...this.clientLatency.values()]
      .map((state) => state.latencyMs)
      .filter((latency): latency is number => latency !== undefined);

    if (latencies.length === 0) {
      return undefined;
    }

    const total = latencies.reduce((sum, latency) => sum + latency, 0);
    return Math.round(total / latencies.length);
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

  if (data.type === "missionControl") {
    return { type: "missionControl" };
  }

  if (data.type === "requestHostState") {
    return { type: "requestHostState" };
  }

  if (data.type === "ping") {
    if (typeof data.id !== "string" || data.id.length === 0) {
      throw new Error("Invalid ping payload");
    }

    return { type: "ping", id: data.id.slice(0, 80) };
  }

  if (data.type === "pong") {
    if (typeof data.id !== "string" || data.id.length === 0) {
      throw new Error("Invalid pong payload");
    }

    return { type: "pong", id: data.id.slice(0, 80) };
  }

  if (data.type === "adjustBrightness") {
    if (data.delta === -1 || data.delta === 1) {
      return { type: "adjustBrightness", delta: data.delta };
    }

    throw new Error("Invalid adjustBrightness payload");
  }

  if (data.type === "setBrightness") {
    if (typeof data.value !== "number") {
      throw new Error("Invalid setBrightness payload");
    }

    return {
      type: "setBrightness",
      value: clampPercent(data.value),
    };
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

  if (data.type === "pasteText") {
    if (typeof data.text !== "string") {
      throw new Error("Invalid pasteText payload");
    }

    return {
      type: "pasteText",
      text: data.text.slice(0, 10000),
    };
  }

  if (data.type === "textCommand") {
    if (
      data.command === "selectAll" ||
      data.command === "copy" ||
      data.command === "paste" ||
      data.command === "newLine" ||
      data.command === "clear" ||
      data.command === "reload" ||
      data.command === "browserBack" ||
      data.command === "browserForward" ||
      data.command === "closeTab" ||
      data.command === "mediaPause" ||
      data.command === "mediaPlay"
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
      data.key === "escape" ||
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
