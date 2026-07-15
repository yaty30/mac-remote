export type ShortcutId = "netflix" | "disney" | "amazon" | "youtube" | "spotify";

export type RemoteMessage =
  | MoveMouseMessage
  | LeftClickMessage
  | DoubleClickMessage
  | RightClickMessage
  | ScrollMessage
  | ZoomMessage
  | SwipeSpacesMessage
  | MissionControlMessage
  | RequestHostStateMessage
  | AdjustBrightnessMessage
  | SetBrightnessMessage
  | SetVolumeMessage
  | SleepMessage
  | RestartHostMessage
  | ShortcutMessage
  | WebsiteShortcutMessage
  | TypeTextMessage
  | PasteTextMessage
  | TextCommandMessage
  | PressKeyMessage;

export type HostMessage = HostStateMessage;

export interface HostDisplayInfo {
  id: number;
  name: string;
  isTv: boolean;
  brightnessAdjustable: boolean;
  volumeAdjustable: boolean;
}

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

export interface MissionControlMessage {
  type: "missionControl";
}

export interface RequestHostStateMessage {
  type: "requestHostState";
}

export interface AdjustBrightnessMessage {
  type: "adjustBrightness";
  delta: -1 | 1;
}

export interface SetBrightnessMessage {
  type: "setBrightness";
  value: number;
}

export interface SetVolumeMessage {
  type: "setVolume";
  value: number;
}

export interface SleepMessage {
  type: "sleep";
}

export interface RestartHostMessage {
  type: "restartHost";
}

export interface HostStateMessage {
  type: "hostState";
  hostName?: string;
  brightness?: number;
  volume?: number;
  display?: HostDisplayInfo;
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

export interface PasteTextMessage {
  type: "pasteText";
  text: string;
}

export type TextCommand =
  | "selectAll"
  | "copy"
  | "paste"
  | "newLine"
  | "clear"
  | "reload"
  | "browserBack"
  | "browserForward"
  | "closeTab"
  | "mediaPause"
  | "mediaPlay";

export interface TextCommandMessage {
  type: "textCommand";
  command: TextCommand;
}

export interface PressKeyMessage {
  type: "pressKey";
  key: "backspace" | "enter" | "escape" | "leftArrow" | "rightArrow";
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
  protocolVersion?: string;
  platform?: string;
  accessibilityTrusted?: boolean;
  accessibilityTargetName?: string;
  accessibilityTargetPath?: string;
  display?: HostDisplayInfo;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  expoUrl?: string;
  expoQrDataUrl?: string;
  errorMessage?: string;
}
