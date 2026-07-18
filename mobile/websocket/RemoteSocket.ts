import type {
  AuthRejectedReason,
  ConnectionStatus,
  HostMessage,
  RemoteMessage,
  ShortcutId,
  TextCommand,
} from "../types/protocol";

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: HostMessage) => void;
type LatencyListener = (latencyMs: number | null) => void;
type AuthOptions = {
  clientId: string;
  clientName: string;
  pairingToken?: string;
  deviceToken?: string;
  onAccepted?: (deviceToken?: string) => void;
  onRejected?: (reason: AuthRejectedReason) => void;
};

const MAX_BUFFERED_BYTES = 16 * 1024;
const AUTH_TIMEOUT_MS = 5000;

export class RemoteSocket {
  private socket: WebSocket | null = null;
  private listeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private latencyListeners = new Set<LatencyListener>();
  private currentHost: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private latencyTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPings = new Map<string, number>();
  private pingSequence = 0;
  private shouldReconnect = false;
  private currentAuth: AuthOptions | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;

  connect(host: string, auth?: AuthOptions, port = 8787): void {
    this.closeSocket();
    this.clearReconnectTimer();
    this.emit("connecting");
    this.currentHost = host;
    this.currentAuth = auth ?? null;
    this.shouldReconnect = true;

    const normalizedHost = host
      .trim()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    const url = `ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:${port}`}`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      if (this.currentAuth) {
        this.sendAuthRequest();
        this.startAuthTimeout();
        return;
      }

      this.emit("connected");
      this.startLatencyChecks();
    };
    socket.onclose = () => {
      this.stopLatencyChecks();
      this.emit(this.shouldReconnect ? "connecting" : "disconnected");
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      if (this.shouldReconnect) {
        this.emit("connecting");
      }
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    this.socket = socket;
  }

  reconnect(): void {
    if (!this.currentHost || this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.connect(this.currentHost, this.currentAuth ?? undefined);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.currentAuth = null;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  private closeSocket(): void {
    this.clearAuthTimeout();
    this.stopLatencyChecks();

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onLatency(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  sendMove(dx: number, dy: number): void {
    this.send({ type: "moveMouse", dx, dy }, true);
  }

  sendLeftClick(): void {
    this.send({ type: "leftClick" });
  }

  sendDoubleClick(): void {
    this.send({ type: "doubleClick" });
  }

  sendRightClick(): void {
    this.send({ type: "rightClick" });
  }

  sendScroll(dx: number, dy: number): void {
    this.send({ type: "scroll", dx, dy }, true);
  }

  sendZoom(direction: "in" | "out"): void {
    this.send({ type: "zoom", direction });
  }

  switchWorkspace(direction: "left" | "right"): void {
    this.send({ type: "switchWorkspace", direction });
  }

  switchWindow(direction: "next" | "previous" = "next"): void {
    this.send({ type: "switchWindow", direction });
  }

  showOverview(): void {
    this.send({ type: "showOverview" });
  }

  sendSwipeSpaces(direction: "left" | "right"): void {
    this.switchWorkspace(direction);
  }

  sendMissionControl(): void {
    this.showOverview();
  }

  requestHostState(): void {
    this.send({ type: "requestHostState" }, true);
  }

  sendBrightness(delta: -1 | 1): void {
    this.send({ type: "adjustBrightness", delta }, true);
  }

  setBrightness(value: number): void {
    this.send({ type: "setBrightness", value });
  }

  sendVolume(value: number): void {
    this.send({ type: "setVolume", value }, true);
  }

  sendSleep(): void {
    this.send({ type: "sleep" });
  }

  sendRestartHost(): void {
    this.send({ type: "restartHost" });
  }

  sendShortcut(shortcut: ShortcutId): void {
    this.send({ type: "shortcut", shortcut });
  }

  sendWebsiteShortcut(name: string, url: string): void {
    this.send({ type: "websiteShortcut", name, url });
  }

  sendText(text: string): void {
    this.send({ type: "typeText", text });
  }

  pasteText(text: string): void {
    this.send({ type: "pasteText", text });
  }

  sendTextCommand(command: TextCommand): void {
    this.send({ type: "textCommand", command });
  }

  moveCaret(direction: "left" | "right", count: number): void {
    this.send({ type: "moveCaret", direction, count }, true);
  }

  sendKey(
    key: "backspace" | "enter" | "escape" | "leftArrow" | "rightArrow",
  ): void {
    this.send({ type: "pressKey", key });
  }

  private send(message: RemoteMessage, lowLatency = false): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (lowLatency && this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private sendAuthRequest(): void {
    const auth = this.currentAuth;

    if (!auth) {
      return;
    }

    this.send(
      {
        type: "authRequest",
        clientId: auth.clientId,
        clientName: auth.clientName,
        pairingToken: auth.pairingToken,
        deviceToken: auth.deviceToken,
      },
      true,
    );
  }

  private startAuthTimeout(): void {
    this.clearAuthTimeout();
    this.authTimer = setTimeout(() => {
      this.authTimer = null;

      if (!this.currentAuth || this.socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      this.currentAuth.onRejected?.("missingCredentials");
      this.shouldReconnect = false;
      this.emit("error");
      this.closeSocket();
    }, AUTH_TIMEOUT_MS);
  }

  private clearAuthTimeout(): void {
    if (!this.authTimer) {
      return;
    }

    clearTimeout(this.authTimer);
    this.authTimer = null;
  }

  private emit(status: ConnectionStatus): void {
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  private emitLatency(latencyMs: number | null): void {
    for (const listener of this.latencyListeners) {
      listener(latencyMs);
    }
  }

  private startLatencyChecks(): void {
    this.stopLatencyChecks(false);
    this.sendLatencyPing();
    this.latencyTimer = setInterval(() => {
      this.sendLatencyPing();
    }, 2000);
  }

  private stopLatencyChecks(emitReset = true): void {
    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }

    this.pendingPings.clear();

    if (emitReset) {
      this.emitLatency(null);
    }
  }

  private sendLatencyPing(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.pingSequence += 1;
    const id = `${Date.now()}-${this.pingSequence}`;
    this.pendingPings.set(id, Date.now());
    this.send({ type: "ping", id }, true);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.currentHost || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect();
    }, 1500);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    try {
      const message = JSON.parse(raw) as HostMessage;

      if (message.type === "ping") {
        if (typeof message.id !== "string") {
          return;
        }

        this.send({ type: "pong", id: message.id }, true);
        return;
      }

      if (message.type === "pong") {
        if (typeof message.id !== "string") {
          return;
        }

        const startedAt = this.pendingPings.get(message.id);

        if (startedAt !== undefined) {
          this.pendingPings.delete(message.id);
          this.emitLatency(Math.max(0, Date.now() - startedAt));
        }

        return;
      }

      if (message.type === "authAccepted") {
        this.clearAuthTimeout();
        this.currentAuth?.onAccepted?.(message.deviceToken);
        this.emit("connected");
        this.startLatencyChecks();
        return;
      }

      if (message.type === "authRejected") {
        this.clearAuthTimeout();
        this.currentAuth?.onRejected?.(message.reason);
        this.shouldReconnect = false;
        this.emit("error");
        this.closeSocket();
        return;
      }

      if (message.type !== "hostState") {
        return;
      }

      for (const listener of this.messageListeners) {
        listener(message);
      }
    } catch {
      // Ignore malformed host messages.
    }
  }
}
