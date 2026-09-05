import { useState } from "react";
import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
  HostStateMessage,
} from "../../types/protocol";

export interface HostProfile {
  platform: HostPlatform | null;
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
}

export function useHostProfile() {
  const [profile, setProfile] = useState<HostProfile>({
    platform: null,
    capabilities: null,
    display: null,
  });

  function applyHostProfile(message: HostStateMessage) {
    setProfile({
      platform: message.platform,
      capabilities: message.capabilities,
      display: message.display ?? null,
    });
  }

  function resetHostProfile() {
    setProfile({
      platform: null,
      capabilities: null,
      display: null,
    });
  }

  return {
    applyHostProfile,
    hostCapabilities: profile.capabilities,
    hostDisplay: profile.display,
    hostPlatform: profile.platform,
    resetHostProfile,
  };
}
