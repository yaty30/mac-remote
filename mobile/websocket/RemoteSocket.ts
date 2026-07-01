import type {
  ConnectionStatus,
  HostMessage,
  RemoteMessage,
  ShortcutId,
  TextCommand,
} from "../types/protocol";

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: HostMessage) => void;

const MAX_BUFFERED_BYTES = 16 * 1024;

export class RemoteSocket {
  private socket: WebSocket | null = null;
  private listeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private currentHost: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  connect(host: string, port = 8787): void {
    this.closeSocket();
    this.clearReconnectTimer();
    this.emit("connecting");
    this.currentHost = host;
    this.shouldReconnect = true;

    const normalizedHost = host
      .trim()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    const url = `ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:${port}`}`;
    const socket = new WebSocket(url);
    let hasOpened = false;
    let hadError = false;

    socket.onopen = () => {
      hasOpened = true;
      this.emit("connected");
    };
    socket.onclose = () => {
      this.emit(hadError && !hasOpened ? "error" : "disconnected");
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      hadError = true;
      this.emit("error");
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    this.socket = socket;
  }

  reconnect(): void {
    if (!this.currentHost || this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.connect(this.currentHost);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  private closeSocket(): void {
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

  sendSwipeSpaces(direction: "left" | "right"): void {
    this.send({ type: "swipeSpaces", direction });
  }

  sendBrightness(delta: -1 | 1): void {
    this.send({ type: "adjustBrightness", delta }, true);
  }

  sendVolume(value: number): void {
    this.send({ type: "setVolume", value }, true);
  }

  sendSleep(): void {
    this.send({ type: "sleep" });
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

  sendTextCommand(command: TextCommand): void {
    this.send({ type: "textCommand", command });
  }

  sendKey(key: "backspace" | "enter" | "leftArrow" | "rightArrow"): void {
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

  private emit(status: ConnectionStatus): void {
    for (const listener of this.listeners) {
      listener(status);
    }
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
