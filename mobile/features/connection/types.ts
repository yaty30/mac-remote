import type { HostPlatform } from "../../types/protocol";

export interface PairingPayload {
  url: string;
  hostName?: string;
}

export interface SavedDevice {
  id: string;
  name: string;
  host: string;
  platform?: HostPlatform;
  lastConnectedAt: number;
}
