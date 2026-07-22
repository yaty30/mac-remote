import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { WebSocket, WebSocketServer } from "ws";
import type {
  AuthAcceptedMessage,
  ApplicationRemoteMessage,
  AuthRequestMessage,
  DesktopStatus,
  HostMessage,
} from "../types/protocol";
import {
  ENCRYPTION_VERSION,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  type SecurePlainMessage,
  SecureTransportSession,
  createSecureNonce,
  validateApplicationRemoteMessage,
  validateRemoteMessage,
} from "../types/protocol";

type MessageHandler = (message: ApplicationRemoteMessage) => Promise<HostMessage | void>;
type AuthHandler = (
  message: AuthRequestMessage,
  challengeNonce: string | undefined,
) => Promise<AuthHandlerResult> | AuthHandlerResult;
type AuthChangeHandler = (
  message: AuthAcceptedMessage,
  clientId: string,
) => void;
type HostStateProvider = () => Promise<HostMessage>;
type ClientLatencyState = {
  latencyMs?: number;
  pendingId?: string;
  pendingStartedAt?: number;
  timer: ReturnType<typeof setInterval>;
};
type AuthHandlerResult =
  | (AuthAcceptedMessage & { transportSecretHash?: string })
  | Exclude<HostMessage, AuthAcceptedMessage>;

interface RemoteServerEvents {
  status: [DesktopStatus];
  error: [Error];
}

export class RemoteWebSocketServer extends EventEmitter<RemoteServerEvents> {
  private readonly server: WebSocketServer;
  private connectedClients = 0;
  private currentStatus: DesktopStatus;
  private readonly clientLatency = new Map<WebSocket, ClientLatencyState>();
  private readonly authenticatedSockets = new Set<WebSocket>();
  private readonly authenticatedClients = new Map<WebSocket, string>();
  private readonly authChallenges = new Map<WebSocket, string>();
  private readonly serverNonces = new Map<WebSocket, string>();
  private readonly secureSessions = new Map<WebSocket, SecureTransportSession>();

  constructor(
    private readonly port: number,
    private readonly onMessage: MessageHandler,
    private readonly onAuth: AuthHandler,
    private readonly getHostState?: HostStateProvider,
    private readonly onAuthChange?: AuthChangeHandler,
  ) {
    super();

    this.server = new WebSocketServer({ port, host: "0.0.0.0" });
    this.currentStatus = this.buildStatus("waiting");
    this.attachHandlers();
  }

  getStatus(): DesktopStatus {
    return this.currentStatus;
  }

  getAuthenticatedClientIds(): Set<string> {
    return new Set(this.authenticatedClients.values());
  }

  disconnectClient(clientId: string): number {
    let disconnected = 0;

    for (const [socket, authenticatedClientId] of this.authenticatedClients) {
      if (authenticatedClientId !== clientId) {
        continue;
      }

      disconnected += 1;
      this.authenticatedSockets.delete(socket);
      this.authenticatedClients.delete(socket);
      this.authChallenges.delete(socket);
      socket.close(1000, "Device disconnected");
    }

    if (disconnected > 0) {
      this.publishStatus();
    }

    return disconnected;
  }

  close(): Promise<void> {
    for (const state of this.clientLatency.values()) {
      clearInterval(state.timer);
    }
    this.clientLatency.clear();
    this.authChallenges.clear();
    this.serverNonces.clear();
    for (const session of this.secureSessions.values()) {
      session.clear();
    }
    this.secureSessions.clear();

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
      const authNonce = randomBytes(32).toString("base64url");
      const serverNonce = createSecureNonce();
      this.authChallenges.set(socket, authNonce);
      this.serverNonces.set(socket, serverNonce);
      sendPlainJson(socket, {
        type: "authChallenge",
        protocolVersion: PROTOCOL_VERSION,
        encryptionVersion: ENCRYPTION_VERSION,
        nonce: authNonce,
        serverNonce,
      });
      this.publishStatus();

      socket.on("message", async (raw) => {
        try {
          const parsed = validateRemoteMessage(JSON.parse(raw.toString()) as unknown);
          const session = this.secureSessions.get(socket);

          if (session) {
            if (parsed.type !== "encrypted") {
              throw new ProtocolValidationError(
                "plaintextAfterSecureMode",
                "Plaintext message after secure mode",
              );
            }

            const message = validateApplicationRemoteMessage(session.decrypt(parsed));
            await this.handleApplicationMessage(socket, message);
            return;
          }

          if (parsed.type === "authRequest") {
            const response = await this.onAuth(
              parsed,
              this.authChallenges.get(socket),
            );

            if (response.type === "authAccepted") {
              if (
                !response.transportSecretHash ||
                !parsed.clientNonce ||
                !this.serverNonces.get(socket)
              ) {
                sendPlainJson(socket, {
                  type: "authRejected",
                  reason: "unsupportedEncryptionVersion",
                });
                socket.close(1002, "Secure handshake failed");
                return;
              }

              const publicResponse: AuthAcceptedMessage = {
                type: "authAccepted",
                protocolVersion: PROTOCOL_VERSION,
                encryptionVersion: ENCRYPTION_VERSION,
                deviceToken: response.deviceToken,
                paired: response.paired,
              };
              sendPlainJson(socket, publicResponse);
              this.secureSessions.set(
                socket,
                new SecureTransportSession({
                  clientId: parsed.clientId,
                  clientNonce: parsed.clientNonce,
                  role: "server",
                  secretHash: response.transportSecretHash,
                  serverNonce: this.serverNonces.get(socket) ?? "",
                }),
              );
              this.authenticatedSockets.add(socket);
              this.authenticatedClients.set(socket, parsed.clientId);
              this.authChallenges.delete(socket);
              this.serverNonces.delete(socket);
              this.startLatencyMonitoring(socket);
              this.publishStatus();
              this.onAuthChange?.(publicResponse, parsed.clientId);
              this.sendHostState(socket).catch((error) => {
                this.publishError(error);
              });
            } else {
              sendPlainJson(socket, response);
            }

            return;
          }

          throw new ProtocolValidationError("invalidPayload", "Expected auth request");
        } catch (error) {
          this.publishError(error);
          if (
            error instanceof ProtocolValidationError &&
            (error.reason === "plaintextAfterSecureMode" ||
              error.reason === "decryptionFailed" ||
              error.reason === "invalidSequence" ||
              error.reason === "replayDetected")
          ) {
            socket.close(1002, "Protocol violation");
          }
        }
      });

      socket.on("close", () => {
        this.authenticatedSockets.delete(socket);
        this.authenticatedClients.delete(socket);
        this.authChallenges.delete(socket);
        this.serverNonces.delete(socket);
        this.secureSessions.get(socket)?.clear();
        this.secureSessions.delete(socket);
        this.stopLatencyMonitoring(socket);
        this.publishStatus();
      });
    });

    this.server.on("error", (error) => this.publishError(error));
  }

  private publishError(error: unknown): void {
    if (this.listenerCount("error") === 0) {
      return;
    }

    this.emit("error", error instanceof Error ? error : new Error(String(error)));
  }

  private async sendHostState(socket: WebSocket): Promise<void> {
    if (!this.getHostState) {
      return;
    }

    this.sendHostMessage(socket, await this.getHostState());
  }

  private async handleApplicationMessage(
    socket: WebSocket,
    message: ApplicationRemoteMessage,
  ): Promise<void> {
    if (message.type === "ping") {
      this.sendHostMessage(socket, { type: "pong", id: message.id });
      return;
    }

    if (message.type === "pong") {
      this.recordLatency(socket, message.id);
      return;
    }

    const response = await this.onMessage(message);

    if (response) {
      this.sendHostMessage(socket, response);
    }
  }

  private sendHostMessage(socket: WebSocket, message: HostMessage): void {
    const session = this.secureSessions.get(socket);

    if (!session) {
      sendPlainJson(socket, message);
      return;
    }

    sendPlainJson(socket, session.encrypt(message as unknown as SecurePlainMessage));
  }

  private publishStatus(): void {
    this.connectedClients = this.authenticatedSockets.size;
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
    this.sendHostMessage(socket, { type: "ping", id });
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

function sendPlainJson(socket: WebSocket, message: HostMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function getLocalIPv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}
