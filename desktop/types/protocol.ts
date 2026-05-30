export type ShortcutId = "netflix" | "disney" | "amazon" | "youtube" | "spotify";

export type RemoteMessage =
  | MoveMouseMessage
  | LeftClickMessage
  | RightClickMessage
  | ScrollMessage
  | ZoomMessage
  | SwipeSpacesMessage
  | AdjustBrightnessMessage
  | SetVolumeMessage
  | ShortcutMessage
  | TypeTextMessage
  | PressKeyMessage;

export interface MoveMouseMessage {
  type: "moveMouse";
  dx: number;
  dy: number;
}

export interface LeftClickMessage {
  type: "leftClick";
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

export interface ShortcutMessage {
  type: "shortcut";
  shortcut: ShortcutId;
}

export interface TypeTextMessage {
  type: "typeText";
  text: string;
}

export interface PressKeyMessage {
  type: "pressKey";
  key: "backspace" | "enter";
}

export type ConnectionStatus =
  | "starting"
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

export interface DesktopStatus {
  status: ConnectionStatus;
  port: number;
  addresses: string[];
  connectedClients: number;
  errorMessage?: string;
}
