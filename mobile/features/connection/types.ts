export interface PairingPayload {
  url: string;
  hostName?: string;
}

export interface SavedDevice {
  id: string;
  name: string;
  host: string;
  lastConnectedAt: number;
}
