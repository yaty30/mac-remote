import type {
  ConnectionStatus,
  RemoteMessage,
  ShortcutId,
} from "../types/protocol";

type StatusListener = (status: ConnectionStatus) => void;

const MAX_BUFFERED_BYTES = 16 * 1024;

export class RemoteSocket {
  private socket: WebSocket | null = null;
  private listeners = new Set<StatusListener>();

  connect(host: string, port = 8787): void {
    this.disconnect();
    this.emit("connecting");

    const normalizedHost = host
      .trim()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    const url = `ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:${port}`}`;
    const socket = new WebSocket(url);

    socket.onopen = () => this.emit("connected");
    socket.onclose = () => this.emit("disconnected");
    socket.onerror = () => this.emit("error");
    this.socket = socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendMove(dx: number, dy: number): void {
    this.send({ type: "moveMouse", dx, dy }, true);
  }

  sendLeftClick(): void {
    this.send({ type: "leftClick" });
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
    this.send({ type: "adjustBrightness", delta });
  }

  sendVolume(value: number): void {
    this.send({ type: "setVolume", value });
  }

  sendShortcut(shortcut: ShortcutId): void {
    this.send({ type: "shortcut", shortcut });
  }

  sendText(text: string): void {
    this.send({ type: "typeText", text });
  }

  sendKey(key: "backspace" | "enter"): void {
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
}
