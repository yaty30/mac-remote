import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
} from "@mac-remote/protocol";

export interface PairedDeviceInfo {
  clientId: string;
  clientName: string;
  pairedAt: number;
  lastSeenAt: number;
  connected: boolean;
}

export type DesktopConnectionStatus =
  | "starting"
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

export interface DesktopStatus {
  status: DesktopConnectionStatus;
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
