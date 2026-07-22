import type {
  RemoteMessage,
  ShortcutId,
  TextCommand,
} from "../types/protocol";

type SendRemoteMessage = (message: RemoteMessage, lowLatency?: boolean) => void;

export class RemoteCommandSender {
  constructor(private readonly send: SendRemoteMessage) {}

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
}
