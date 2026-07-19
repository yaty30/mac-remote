import type {
  AuthRejectedReason,
  ConnectionStatus,
  HostMessage,
  RemoteMessage,
  ShortcutId,
  TextCommand,
} from "../types/protocol";
import {
  buildTokenProof,
  deriveDeviceToken,
  getTokenId,
  hashToken,
} from "../features/security/tokenProof";

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: HostMessage) => void;
type LatencyListener = (latencyMs: number | null) => void;
export type AuthOptions = {
  clientId: string;
  clientName: string;
  pairingToken?: string;
  deviceToken?: string;
  onAccepted?: (deviceToken?: string) => void;
  onRejected?: (reason: AuthRejectedReason) => void;
  onConnected?: () => void;
};

const MAX_BUFFERED_BYTES = 16 * 1024;
const AUTH_TIMEOUT_MS = 5000;

export class RemoteSocket {
  private socket: WebSocket | null = null;
  private pendingSocket: WebSocket | null = null;
  private listeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private latencyListeners = new Set<LatencyListener>();
  private currentHost: string | null = null;
  private pendingHost: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private latencyTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPings = new Map<string, number>();
  private pingSequence = 0;
  private shouldReconnect = false;
  private currentAuth: AuthOptions | null = null;
  private pendingAuth: AuthOptions | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAuthTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPairingDeviceToken: string | null = null;
  private pendingConnectionDeviceToken: string | null = null;

  connect(host: string, auth?: AuthOptions, port = 8787): void {
    this.closeSocket();
    this.closePendingSocket();
    this.clearReconnectTimer();
    this.emit("connecting");
    this.currentHost = host;
    this.currentAuth = auth ?? null;
    this.pendingPairingDeviceToken = null;
    this.shouldReconnect = true;

    const normalizedHost = host
      .trim()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    const url = `ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:${port}`}`;
    const socket = new WebSocket(url);

    this.attachActiveSocketHandlers(socket);
    this.socket = socket;
  }

  connectPending(host: string, auth: AuthOptions, port = 8787): void {
    this.closePendingSocket();
    this.pendingHost = host;
    this.pendingAuth = auth;
    this.pendingConnectionDeviceToken = null;

    const normalizedHost = host
      .trim()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    const url = `ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:${port}`}`;
    const socket = new WebSocket(url);

    this.attachPendingSocketHandlers(socket);
    this.pendingSocket = socket;
  }

  cancelPendingConnection(): void {
    this.closePendingSocket();
  }

  private attachActiveSocketHandlers(socket: WebSocket): void {
    socket.onopen = () => {
      if (this.currentAuth) {
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
    socket.onmessage = (event) => this.handleMessage(event.data, false);
  }

  private attachPendingSocketHandlers(socket: WebSocket): void {
    socket.onopen = () => {
      if (this.pendingAuth) {
        this.startPendingAuthTimeout();
        return;
      }

      this.promotePendingSocket();
    };
    socket.onclose = () => {
      this.clearPendingAuthTimeout();
      this.pendingAuth?.onRejected?.("missingCredentials");
      this.closePendingSocket();
    };
    socket.onerror = () => {
      // Keep the active socket/UI in place. The overlay owns cancellation.
    };
    socket.onmessage = (event) => this.handleMessage(event.data, true);
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
    this.pendingPairingDeviceToken = null;
    this.closePendingSocket();
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

  private closePendingSocket(): void {
    this.clearPendingAuthTimeout();
    this.pendingHost = null;
    this.pendingAuth = null;
    this.pendingConnectionDeviceToken = null;

    if (this.pendingSocket) {
      this.pendingSocket.onopen = null;
      this.pendingSocket.onclose = null;
      this.pendingSocket.onerror = null;
      this.pendingSocket.onmessage = null;
      this.pendingSocket.close();
      this.pendingSocket = null;
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
    this.sendToSocket(this.socket, message, lowLatency);
  }

  private sendAuthRequest(challengeNonce: string, pending: boolean): void {
    const auth = pending ? this.pendingAuth : this.currentAuth;

    if (!auth) {
      return;
    }

    const authRequest: RemoteMessage = {
      type: "authRequest",
      clientId: auth.clientId,
      clientName: auth.clientName,
    };

    if (auth.deviceToken) {
      const deviceTokenHash = hashToken(auth.deviceToken);
      authRequest.deviceTokenProof = buildTokenProof(
        deviceTokenHash,
        auth.clientId,
        challengeNonce,
      );
    } else if (auth.pairingToken) {
      const pairingTokenHash = hashToken(auth.pairingToken);
      authRequest.pairingTokenId = getTokenId(pairingTokenHash);
      authRequest.pairingTokenProof = buildTokenProof(
        pairingTokenHash,
        auth.clientId,
        challengeNonce,
      );
      const nextDeviceToken = deriveDeviceToken(
        pairingTokenHash,
        auth.clientId,
        challengeNonce,
      );
      if (pending) {
        this.pendingConnectionDeviceToken = nextDeviceToken;
      } else {
        this.pendingPairingDeviceToken = nextDeviceToken;
      }
    }

    this.sendToSocket(
      pending ? this.pendingSocket : this.socket,
      authRequest,
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

  private startPendingAuthTimeout(): void {
    this.clearPendingAuthTimeout();
    this.pendingAuthTimer = setTimeout(() => {
      this.pendingAuthTimer = null;

      if (
        !this.pendingAuth ||
        this.pendingSocket?.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      this.pendingAuth.onRejected?.("missingCredentials");
      this.closePendingSocket();
    }, AUTH_TIMEOUT_MS);
  }

  private clearPendingAuthTimeout(): void {
    if (!this.pendingAuthTimer) {
      return;
    }

    clearTimeout(this.pendingAuthTimer);
    this.pendingAuthTimer = null;
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

  private handleMessage(raw: unknown, pending: boolean): void {
    if (typeof raw !== "string") {
      return;
    }

    try {
      const message = JSON.parse(raw) as HostMessage;

      if (message.type === "ping") {
        if (typeof message.id !== "string") {
          return;
        }

        this.sendToSocket(
          pending ? this.pendingSocket : this.socket,
          { type: "pong", id: message.id },
          true,
        );
        return;
      }

      if (message.type === "authChallenge") {
        if (typeof message.nonce !== "string") {
          return;
        }

        this.sendAuthRequest(message.nonce, pending);
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
        if (pending) {
          this.clearPendingAuthTimeout();
          this.pendingAuth?.onAccepted?.(
            message.deviceToken ??
              this.pendingConnectionDeviceToken ??
              undefined,
          );
          this.pendingConnectionDeviceToken = null;
          this.promotePendingSocket();
        } else {
          this.clearAuthTimeout();
          this.currentAuth?.onAccepted?.(
            message.deviceToken ?? this.pendingPairingDeviceToken ?? undefined,
          );
          this.pendingPairingDeviceToken = null;
          this.emit("connected");
          this.startLatencyChecks();
        }
        return;
      }

      if (message.type === "authRejected") {
        if (pending) {
          this.clearPendingAuthTimeout();
          this.pendingAuth?.onRejected?.(message.reason);
          this.closePendingSocket();
        } else {
          this.clearAuthTimeout();
          this.currentAuth?.onRejected?.(message.reason);
          this.pendingPairingDeviceToken = null;
          this.shouldReconnect = false;
          this.emit("error");
          this.closeSocket();
        }
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

  private promotePendingSocket(): void {
    const socket = this.pendingSocket;
    const host = this.pendingHost;
    const auth = this.pendingAuth;

    if (!socket || !host) {
      return;
    }

    this.pendingSocket = null;
    this.pendingHost = null;
    this.pendingAuth = null;
    this.pendingConnectionDeviceToken = null;
    this.closeSocket();
    this.clearReconnectTimer();
    this.currentHost = host;
    this.currentAuth = auth;
    this.shouldReconnect = true;
    this.socket = socket;
    this.attachActiveSocketHandlers(socket);
    auth?.onConnected?.();
    this.emit("connected");
    this.startLatencyChecks();
  }

  private sendToSocket(
    socket: WebSocket | null,
    message: RemoteMessage,
    lowLatency = false,
  ): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (lowLatency && socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      return;
    }

    socket.send(JSON.stringify(message));
  }
}
