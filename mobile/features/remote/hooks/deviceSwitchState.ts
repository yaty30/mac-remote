import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
} from "../../../types/protocol";

export interface DeviceSwitchUiSnapshot {
  host: string;
  name: string;
  platform: HostPlatform | null;
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
}

interface CreateDeviceSwitchSnapshotParams {
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
  getSelectedDevicePlatform: (
    activeHost: string,
    activePlatform: HostPlatform | null,
  ) => HostPlatform | undefined;
  host: string;
  hostName: string;
  platform: HostPlatform | null;
  status: string;
}

export function createDeviceSwitchSnapshot({
  capabilities,
  display,
  getSelectedDevicePlatform,
  host,
  hostName,
  platform,
  status,
}: CreateDeviceSwitchSnapshotParams): DeviceSwitchUiSnapshot | null {
  const hasActiveDevice = status === "connected" && host.trim().length > 0;

  if (!hasActiveDevice) {
    return null;
  }

  return {
    host,
    name: hostName,
    platform: platform ?? getSelectedDevicePlatform(host, platform) ?? null,
    capabilities,
    display,
  };
}

export function shouldCompleteDeviceSwitch({
  host,
  hostPlatform,
  status,
  switchingDeviceHost,
}: {
  host: string;
  hostPlatform: HostPlatform | null;
  status: string;
  switchingDeviceHost: string;
}) {
  return Boolean(
    switchingDeviceHost &&
      status === "connected" &&
      hostPlatform &&
      host === switchingDeviceHost,
  );
}
