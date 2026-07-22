import { useEffect, useMemo, type RefObject } from "react";
import {
  createAppTourSteps,
} from "../../../components/tour/tourSteps";
import { useAppTour } from "../../../components/tour/useAppTour";
import type { HostCapabilities, HostPlatform } from "../../../types/protocol";
import type { RemoteKeyboardHandle } from "../Keyboard";
import type { RemoteSettingsHandle } from "../Settings";

interface UseRemoteTourSetupParams {
  appSplashReleased: boolean;
  capabilities: HostCapabilities | null;
  deviceSwitchOverlayMounted: boolean;
  hostPlatform: HostPlatform | null;
  keyboardRef: RefObject<RemoteKeyboardHandle | null>;
  scannerVisible: boolean;
  settingsRef: RefObject<RemoteSettingsHandle | null>;
  showConnectionPrompt: boolean;
}

export function useRemoteTourSetup({
  appSplashReleased,
  capabilities,
  deviceSwitchOverlayMounted,
  hostPlatform,
  keyboardRef,
  scannerVisible,
  settingsRef,
  showConnectionPrompt,
}: UseRemoteTourSetupParams) {
  const {
    handleRestartTour,
    setTourAutoStartEnabled,
    setTourSteps,
  } = useAppTour();

  const tourSteps = useMemo(
    () =>
      createAppTourSteps({
        capabilities,
        closeKeyboard: () => keyboardRef.current?.close(),
        closeSettings: () => settingsRef.current?.close(),
        platform: hostPlatform,
      }),
    [capabilities, hostPlatform, keyboardRef, settingsRef],
  );

  useEffect(() => {
    setTourSteps(tourSteps);
  }, [setTourSteps, tourSteps]);

  useEffect(() => {
    setTourAutoStartEnabled(
      appSplashReleased &&
        !showConnectionPrompt &&
        !deviceSwitchOverlayMounted &&
        !scannerVisible,
    );
  }, [
    appSplashReleased,
    deviceSwitchOverlayMounted,
    scannerVisible,
    setTourAutoStartEnabled,
    showConnectionPrompt,
  ]);

  return {
    handleRestartTour,
  };
}
