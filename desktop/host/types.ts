import type { Display } from "electron";
import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
  ShortcutId,
  TextCommand,
} from "../types/protocol";

export interface DisplayContext {
  display: Display;
  info: Pick<HostDisplayInfo, "isTv">;
}

export interface DisplayControlCapabilities {
  brightnessAdjustable: boolean;
  volumeAdjustable: boolean;
}

export interface HostAdapter {
  platform: HostPlatform;
  getDisplayControlCapabilities(
    context: DisplayContext,
  ): DisplayControlCapabilities;
  getCapabilities(display: HostDisplayInfo): HostCapabilities;
  getDisplayBrightness(): Promise<number | undefined>;
  adjustBrightness(delta: -1 | 1): Promise<void>;
  setBrightness(value: number): Promise<void>;
  getOutputVolume(): Promise<number | undefined>;
  setVolume(value: number): Promise<void>;
  textCommand(command: TextCommand): Promise<void>;
  zoom(direction: "in" | "out"): Promise<void>;
  switchWorkspace(direction: "left" | "right"): Promise<void>;
  switchWindow(direction: "next" | "previous"): Promise<void>;
  showOverview(): Promise<void>;
  runShortcut(shortcut: ShortcutId): Promise<void>;
  runWebsiteShortcut(url: string): Promise<void>;
  sleep(): Promise<void>;
  restartHost(): Promise<void>;
}
