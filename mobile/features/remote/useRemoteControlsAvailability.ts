import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
} from "../../types/protocol";

export function useRemoteControlsAvailability(input: {
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
  platform: HostPlatform | null;
}) {
  const { capabilities, display, platform } = input;

  return {
    brightnessAvailable:
      capabilities?.brightness === true &&
      display?.brightnessAdjustable === true,
    overviewAvailable: capabilities?.showOverview === true,
    overviewLabel: platform === "win32" ? "Task View" : "Mission Control",
    sleepAvailable: capabilities?.sleep === true,
    switchWindowAvailable: capabilities?.switchWindow === true,
    switchWorkspaceAvailable: capabilities?.switchWorkspace === true,
    volumeAvailable:
      capabilities?.volume === true && display?.volumeAdjustable === true,
  };
}
