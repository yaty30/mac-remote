import type {
  AuthRejectedReason,
  ApplicationHostMessage,
  ConnectionStatus,
  HostMessage,
  RemoteMessage,
  ShortcutId,
  TextCommand,
} from "../types/protocol";
import {
  ENCRYPTION_VERSION,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  type SecurePlainMessage,
  SecureTransportSession,
  createSecureNonce,
  validateApplicationHostMessage,
  validateHostMessage,
} from "../types/protocol";
import { RemoteCommandSender } from "./RemoteCommandSender";
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
  private clientNonce: string | null = null;
  private pendingClientNonce: string | null = null;
  private serverNonce: string | null = null;
  private pendingServerNonce: string | null = null;
  private transportSecretHash: string | null = null;
  private pendingTransportSecretHash: string | null = null;
  private secureSession: SecureTransportSession | null = null;
  private pendingSecureSession: SecureTransportSession | null = null;
  private readonly commandSender = new RemoteCommandSender((message, lowLatency) =>
    this.send(message, lowLatency),
  );

  connect(host: string, auth?: AuthOptions, port = 8787): void {
    this.closeSocket();
    this.closePendingSocket();
    this.clearReconnectTimer();
    this.emit("connecting");
    this.currentHost = host;
    this.currentAuth = auth ?? null;
    this.pendingPairingDeviceToken = null;
    this.transportSecretHash = null;
    this.clientNonce = null;
    this.serverNonce = null;
    this.secureSession?.clear();
    this.secureSession = null;
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
    this.pendingClientNonce = null;
    this.pendingServerNonce = null;
    this.pendingTransportSecretHash = null;
    this.pendingSecureSession?.clear();
    this.pendingSecureSession = null;

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
    this.transportSecretHash = null;
    this.clientNonce = null;
    this.serverNonce = null;
    this.secureSession?.clear();
    this.secureSession = null;
    this.closePendingSocket();
    this.clearReconnectTimer();
    this.closeSocket();
  }

  private closeSocket(): void {
    this.clearAuthTimeout();
    this.stopLatencyChecks();
    this.secureSession?.clear();
    this.secureSession = null;

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
    this.pendingClientNonce = null;
    this.pendingServerNonce = null;
    this.pendingTransportSecretHash = null;
    this.pendingSecureSession?.clear();
    this.pendingSecureSession = null;

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
    this.commandSender.sendMove(dx, dy);
  }

  sendLeftClick(): void {
    this.commandSender.sendLeftClick();
  }

  sendDoubleClick(): void {
    this.commandSender.sendDoubleClick();
  }

  sendRightClick(): void {
    this.commandSender.sendRightClick();
  }

  sendScroll(dx: number, dy: number): void {
    this.commandSender.sendScroll(dx, dy);
  }

  sendZoom(direction: "in" | "out"): void {
    this.commandSender.sendZoom(direction);
  }

  switchWorkspace(direction: "left" | "right"): void {
    this.commandSender.switchWorkspace(direction);
  }

  switchWindow(direction: "next" | "previous" = "next"): void {
    this.commandSender.switchWindow(direction);
  }

  showOverview(): void {
    this.commandSender.showOverview();
  }

  sendSwipeSpaces(direction: "left" | "right"): void {
    this.switchWorkspace(direction);
  }

  sendMissionControl(): void {
    this.showOverview();
  }

  requestHostState(): void {
    this.commandSender.requestHostState();
  }

  sendBrightness(delta: -1 | 1): void {
    this.commandSender.sendBrightness(delta);
  }

  setBrightness(value: number): void {
    this.commandSender.setBrightness(value);
  }

  sendVolume(value: number): void {
    this.commandSender.sendVolume(value);
  }

  sendSleep(): void {
    this.commandSender.sendSleep();
  }

  sendRestartHost(): void {
    this.commandSender.sendRestartHost();
  }

  sendShortcut(shortcut: ShortcutId): void {
    this.commandSender.sendShortcut(shortcut);
  }

  sendWebsiteShortcut(name: string, url: string): void {
    this.commandSender.sendWebsiteShortcut(name, url);
  }

  sendText(text: string): void {
    this.commandSender.sendText(text);
  }

  pasteText(text: string): void {
    this.commandSender.pasteText(text);
  }

  sendTextCommand(command: TextCommand): void {
    this.commandSender.sendTextCommand(command);
  }

  moveCaret(direction: "left" | "right", count: number): void {
    this.commandSender.moveCaret(direction, count);
  }

  sendKey(
    key: "backspace" | "enter" | "escape" | "leftArrow" | "rightArrow",
  ): void {
    this.commandSender.sendKey(key);
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
      protocolVersion: PROTOCOL_VERSION,
      encryptionVersion: ENCRYPTION_VERSION,
      clientId: auth.clientId,
      clientName: auth.clientName,
    };
    const clientNonce = createSecureNonce();
    authRequest.clientNonce = clientNonce;

    if (auth.deviceToken) {
      const deviceTokenHash = hashToken(auth.deviceToken);
      if (pending) {
        this.pendingTransportSecretHash = deviceTokenHash;
        this.pendingClientNonce = clientNonce;
      } else {
        this.transportSecretHash = deviceTokenHash;
        this.clientNonce = clientNonce;
      }
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
      const nextDeviceTokenHash = hashToken(nextDeviceToken);
      if (pending) {
        this.pendingConnectionDeviceToken = nextDeviceToken;
        this.pendingTransportSecretHash = nextDeviceTokenHash;
        this.pendingClientNonce = clientNonce;
      } else {
        this.pendingPairingDeviceToken = nextDeviceToken;
        this.transportSecretHash = nextDeviceTokenHash;
        this.clientNonce = clientNonce;
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
      const parsed = validateHostMessage(JSON.parse(raw) as unknown);
      const session = pending ? this.pendingSecureSession : this.secureSession;

      if (session) {
        if (parsed.type !== "encrypted") {
          throw new ProtocolValidationError(
            "plaintextAfterSecureMode",
            "Plaintext message after secure mode",
          );
        }

        this.handleApplicationMessage(
          validateApplicationHostMessage(session.decrypt(parsed)),
          pending,
        );
        return;
      }

      if (parsed.type === "authChallenge") {
        if (pending) {
          this.pendingServerNonce = parsed.serverNonce ?? null;
        } else {
          this.serverNonce = parsed.serverNonce ?? null;
        }
        this.sendAuthRequest(parsed.nonce, pending);
        return;
      }

      if (parsed.type === "authAccepted") {
        if (pending) {
          this.clearPendingAuthTimeout();
          const acceptedDeviceToken =
            parsed.deviceToken ?? this.pendingConnectionDeviceToken ?? undefined;
          this.createPendingSecureSession(acceptedDeviceToken);
          this.pendingAuth?.onAccepted?.(
            acceptedDeviceToken,
          );
          this.pendingConnectionDeviceToken = null;
          this.promotePendingSocket();
        } else {
          this.clearAuthTimeout();
          const acceptedDeviceToken =
            parsed.deviceToken ?? this.pendingPairingDeviceToken ?? undefined;
          this.createSecureSession(acceptedDeviceToken);
          this.currentAuth?.onAccepted?.(
            acceptedDeviceToken,
          );
          this.pendingPairingDeviceToken = null;
          this.emit("connected");
          this.startLatencyChecks();
        }
        return;
      }

      if (parsed.type === "authRejected") {
        if (pending) {
          this.clearPendingAuthTimeout();
          this.pendingAuth?.onRejected?.(parsed.reason);
          this.closePendingSocket();
        } else {
          this.clearAuthTimeout();
          this.currentAuth?.onRejected?.(parsed.reason);
          this.pendingPairingDeviceToken = null;
          this.shouldReconnect = false;
          this.emit("error");
          this.closeSocket();
        }
        return;
      }

      throw new ProtocolValidationError("invalidPayload", "Expected auth handshake");
    } catch (error) {
      if (
        error instanceof ProtocolValidationError &&
        (error.reason === "plaintextAfterSecureMode" ||
          error.reason === "decryptionFailed" ||
          error.reason === "invalidSequence" ||
          error.reason === "replayDetected")
      ) {
        this.shouldReconnect = false;
        this.emit("error");
        if (pending) {
          this.closePendingSocket();
        } else {
          this.closeSocket();
        }
      }
    }
  }

  private handleApplicationMessage(
    message: ApplicationHostMessage,
    pending: boolean,
  ): void {
    if (message.type === "ping") {
      this.sendToSocket(
        pending ? this.pendingSocket : this.socket,
        { type: "pong", id: message.id },
        true,
      );
      return;
    }

    if (message.type === "pong") {
      const startedAt = this.pendingPings.get(message.id);

      if (startedAt !== undefined) {
        this.pendingPings.delete(message.id);
        this.emitLatency(Math.max(0, Date.now() - startedAt));
      }

      return;
    }

    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private createSecureSession(deviceToken?: string): void {
    const secretHash = deviceToken ? hashToken(deviceToken) : this.transportSecretHash;

    if (!secretHash || !this.clientNonce || !this.serverNonce || !this.currentAuth) {
      throw new ProtocolValidationError(
        "secureHandshakeTimeout",
        "Missing secure handshake state",
      );
    }

    this.secureSession?.clear();
    this.secureSession = new SecureTransportSession({
      clientId: this.currentAuth.clientId,
      clientNonce: this.clientNonce,
      role: "client",
      secretHash,
      serverNonce: this.serverNonce,
    });
    this.transportSecretHash = secretHash;
  }

  private createPendingSecureSession(deviceToken?: string): void {
    const secretHash = deviceToken
      ? hashToken(deviceToken)
      : this.pendingTransportSecretHash;

    if (
      !secretHash ||
      !this.pendingClientNonce ||
      !this.pendingServerNonce ||
      !this.pendingAuth
    ) {
      throw new ProtocolValidationError(
        "secureHandshakeTimeout",
        "Missing pending secure handshake state",
      );
    }

    this.pendingSecureSession?.clear();
    this.pendingSecureSession = new SecureTransportSession({
      clientId: this.pendingAuth.clientId,
      clientNonce: this.pendingClientNonce,
      role: "client",
      secretHash,
      serverNonce: this.pendingServerNonce,
    });
    this.pendingTransportSecretHash = secretHash;
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
    const pendingSession = this.pendingSecureSession;
    const pendingSecretHash = this.pendingTransportSecretHash;
    const pendingClientNonce = this.pendingClientNonce;
    const pendingServerNonce = this.pendingServerNonce;
    this.pendingSecureSession = null;
    this.pendingTransportSecretHash = null;
    this.pendingClientNonce = null;
    this.pendingServerNonce = null;
    this.closeSocket();
    this.clearReconnectTimer();
    this.currentHost = host;
    this.currentAuth = auth;
    this.secureSession = pendingSession;
    this.transportSecretHash = pendingSecretHash;
    this.clientNonce = pendingClientNonce;
    this.serverNonce = pendingServerNonce;
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

    if (message.type === "authRequest") {
      socket.send(JSON.stringify(message));
      return;
    }

    const session =
      socket === this.pendingSocket ? this.pendingSecureSession : this.secureSession;

    if (!session) {
      return;
    }

    socket.send(JSON.stringify(session.encrypt(message as unknown as SecurePlainMessage)));
  }
}
