export type ShortcutId = "netflix" | "disney" | "amazon" | "youtube" | "spotify";
export type HostPlatform = "darwin" | "win32";

export interface HostCapabilities {
  brightness: boolean;
  volume: boolean;
  switchWorkspace: boolean;
  switchWindow: boolean;
  showOverview: boolean;
  sleep: boolean;
  restart: boolean;
}

export type RemoteMessage =
  | AuthRequestMessage
  | MoveMouseMessage
  | LeftClickMessage
  | DoubleClickMessage
  | RightClickMessage
  | ScrollMessage
  | ZoomMessage
  | SwitchWorkspaceMessage
  | SwitchWindowMessage
  | ShowOverviewMessage
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
  | MoveCaretMessage
  | PressKeyMessage
  | PingMessage
  | PongMessage;

export type HostMessage =
  | AuthChallengeMessage
  | AuthAcceptedMessage
  | AuthRejectedMessage
  | HostStateMessage
  | PingMessage
  | PongMessage;

export type AuthRejectedReason =
  | "missingCredentials"
  | "pairingTokenExpired"
  | "pairingTokenInvalid"
  | "pairingTokenUsed"
  | "deviceNotTrusted";

export interface HostDisplayInfo {
  id: number;
  name: string;
  isTv: boolean;
  brightnessAdjustable: boolean;
  volumeAdjustable: boolean;
}

export interface PairedDeviceInfo {
  clientId: string;
  clientName: string;
  pairedAt: number;
  lastSeenAt: number;
  connected: boolean;
}

export interface AuthRequestMessage {
  type: "authRequest";
  clientId: string;
  clientName: string;
  pairingToken?: string;
  pairingTokenId?: string;
  pairingTokenProof?: string;
  deviceToken?: string;
  deviceTokenProof?: string;
}

export interface AuthChallengeMessage {
  type: "authChallenge";
  nonce: string;
}

export interface AuthAcceptedMessage {
  type: "authAccepted";
  deviceToken?: string;
  paired: boolean;
}

export interface AuthRejectedMessage {
  type: "authRejected";
  reason: AuthRejectedReason;
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

export interface SwitchWorkspaceMessage {
  type: "switchWorkspace";
  direction: "left" | "right";
}

export interface SwitchWindowMessage {
  type: "switchWindow";
  direction: "next" | "previous";
}

export interface ShowOverviewMessage {
  type: "showOverview";
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
  platform: HostPlatform;
  capabilities: HostCapabilities;
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

export interface MoveCaretMessage {
  type: "moveCaret";
  direction: "left" | "right";
  count: number;
}

export interface PressKeyMessage {
  type: "pressKey";
  key: "backspace" | "enter" | "escape" | "leftArrow" | "rightArrow";
}

export interface PingMessage {
  type: "ping";
  id: string;
}

export interface PongMessage {
  type: "pong";
  id: string;
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
  platform?: HostPlatform;
  capabilities?: HostCapabilities;
  accessibilityTrusted?: boolean;
  accessibilityTargetName?: string;
  accessibilityTargetPath?: string;
  display?: HostDisplayInfo;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairedDevices?: PairedDeviceInfo[];
  latencyMs?: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  pairingTokenExpiresAt?: number;
  expoUrl?: string;
  expoQrDataUrl?: string;
  errorMessage?: string;
}
