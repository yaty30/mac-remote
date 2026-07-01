export type ShortcutId = "netflix" | "disney" | "amazon" | "youtube" | "spotify";

export type RemoteMessage =
  | MoveMouseMessage
  | LeftClickMessage
  | DoubleClickMessage
  | RightClickMessage
  | ScrollMessage
  | ZoomMessage
  | SwipeSpacesMessage
  | AdjustBrightnessMessage
  | SetVolumeMessage
  | SleepMessage
  | ShortcutMessage
  | WebsiteShortcutMessage
  | TypeTextMessage
  | TextCommandMessage
  | PressKeyMessage;

export type HostMessage = HostStateMessage;

export interface MoveMouseMessage {
  type: "moveMouse";
  dx: number;
  dy: number;
}

export interface LeftClickMessage {
  type: "leftClick";
}

export interface DoubleClickMessage {
  type: "doubleClick";
}

export interface RightClickMessage {
  type: "rightClick";
}

export interface ScrollMessage {
  type: "scroll";
  dx: number;
  dy: number;
}

export interface ZoomMessage {
  type: "zoom";
  direction: "in" | "out";
}

export interface SwipeSpacesMessage {
  type: "swipeSpaces";
  direction: "left" | "right";
}

export interface AdjustBrightnessMessage {
  type: "adjustBrightness";
  delta: -1 | 1;
}

export interface SetVolumeMessage {
  type: "setVolume";
  value: number;
}

export interface SleepMessage {
  type: "sleep";
}

export interface HostStateMessage {
  type: "hostState";
  hostName?: string;
  volume?: number;
}

export interface ShortcutMessage {
  type: "shortcut";
  shortcut: ShortcutId;
}

export interface WebsiteShortcutMessage {
  type: "websiteShortcut";
  name: string;
  url: string;
}

export interface TypeTextMessage {
  type: "typeText";
  text: string;
}

export type TextCommand = "selectAll" | "copy" | "paste" | "clear";

export interface TextCommandMessage {
  type: "textCommand";
  command: TextCommand;
}

export interface PressKeyMessage {
  type: "pressKey";
  key: "backspace" | "enter" | "leftArrow" | "rightArrow";
}

export type ConnectionStatus =
  | "starting"
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

export interface DesktopStatus {
  status: ConnectionStatus;
  hostName?: string;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  expoUrl?: string;
  expoQrDataUrl?: string;
  errorMessage?: string;
}
