import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
} from "../../../types/protocol";
import type { SavedDevice } from "../../connection/types";
import {
  createDeviceSwitchSnapshot,
  shouldCompleteDeviceSwitch,
  type DeviceSwitchUiSnapshot,
} from "./deviceSwitchState";

const DEVICE_SWITCH_MIN_OVERLAY_MS = 1000;
const DEVICE_SWITCH_CANCEL_DELAY_MS = 3000;

const DEVICE_SWITCH_SPINNER_STEP_COUNT = 3;
const DEVICE_SWITCH_SPINNER_FIRST_HALF_MS = 810;
const DEVICE_SWITCH_SPINNER_SECOND_HALF_MS = 680;

interface UseDeviceSwitchFlowParams {
  cancelConnection: () => void;
  cancelPendingConnection: () => void;
  getSelectedDevicePlatform: (
    activeHost: string,
    activePlatform: HostPlatform | null,
  ) => HostPlatform | undefined;
  host: string;
  hostCapabilities: HostCapabilities | null;
  hostDisplay: HostDisplayInfo | null;
  hostName: string;
  hostPlatform: HostPlatform | null;
  selectSavedDevice: (device: SavedDevice) => void;
  setDeviceDropdownOpen: (open: boolean) => void;
  status: string;
}

export function useDeviceSwitchFlow({
  cancelConnection,
  cancelPendingConnection,
  getSelectedDevicePlatform,
  host,
  hostCapabilities,
  hostDisplay,
  hostName,
  hostPlatform,
  selectSavedDevice,
  setDeviceDropdownOpen,
  status,
}: UseDeviceSwitchFlowParams) {
  const deviceSwitchStartedAtRef = useRef(0);

  const deviceSwitchDismissTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const deviceSwitchCancelTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const previousDeviceRef = useRef<{
    host: string;
    name?: string;
  } | null>(null);

  const deviceSwitchCancellingRef = useRef(false);

  const deviceSwitchOverlayAnim = useRef(
    new Animated.Value(0),
  ).current;

  /*
   * Spinner value:
   *
   * 0 = 0deg
   * 1 = 45deg
   * 2 = 90deg
   * ...
   * 8 = 360deg
   */
  const deviceSwitchSpinnerAnim = useRef(
    new Animated.Value(0),
  ).current;

  const deviceSwitchCancelAnim = useRef(
    new Animated.Value(0),
  ).current;

  const [deviceSwitchOverlayMounted, setDeviceSwitchOverlayMounted] =
    useState(false);

  const [deviceSwitchCancelVisible, setDeviceSwitchCancelVisible] =
    useState(false);

  const [deviceSwitchUiSnapshot, setDeviceSwitchUiSnapshot] =
    useState<DeviceSwitchUiSnapshot | null>(null);

  const [switchingDeviceName, setSwitchingDeviceName] = useState("");
  const [switchingDeviceHost, setSwitchingDeviceHost] = useState("");

  function clearDeviceSwitchTimers() {
    if (deviceSwitchDismissTimerRef.current !== null) {
      clearTimeout(deviceSwitchDismissTimerRef.current);
      deviceSwitchDismissTimerRef.current = null;
    }

    if (deviceSwitchCancelTimerRef.current !== null) {
      clearTimeout(deviceSwitchCancelTimerRef.current);
      deviceSwitchCancelTimerRef.current = null;
    }
  }

  function resetDeviceSwitchCancelButton() {
    setDeviceSwitchCancelVisible(false);

    deviceSwitchCancelAnim.stopAnimation();
    deviceSwitchCancelAnim.setValue(0);
  }

  function clearCompletedDeviceSwitch() {
    setDeviceSwitchOverlayMounted(false);
    setSwitchingDeviceHost("");
    setSwitchingDeviceName("");
    previousDeviceRef.current = null;
  }

  useEffect(() => {
    const shouldComplete = shouldCompleteDeviceSwitch({
      host,
      hostPlatform,
      status,
      switchingDeviceHost,
    });

    if (!shouldComplete) {
      return;
    }

    if (deviceSwitchDismissTimerRef.current !== null) {
      clearTimeout(deviceSwitchDismissTimerRef.current);
      deviceSwitchDismissTimerRef.current = null;
    }

    const elapsed = Date.now() - deviceSwitchStartedAtRef.current;
    const remaining = Math.max(
      0,
      DEVICE_SWITCH_MIN_OVERLAY_MS - elapsed,
    );

    deviceSwitchDismissTimerRef.current = setTimeout(() => {
      deviceSwitchDismissTimerRef.current = null;
      setDeviceSwitchUiSnapshot(null);

      Animated.timing(deviceSwitchOverlayAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          clearCompletedDeviceSwitch();
        }
      });
    }, remaining);
  }, [
    deviceSwitchOverlayAnim,
    host,
    hostPlatform,
    status,
    switchingDeviceHost,
  ]);

  useEffect(() => {
    if (!deviceSwitchOverlayMounted) {
      deviceSwitchSpinnerAnim.stopAnimation();
      deviceSwitchSpinnerAnim.setValue(0);
      return;
    }

    deviceSwitchSpinnerAnim.stopAnimation();
    deviceSwitchSpinnerAnim.setValue(0);

    /*
     * Build eight 45-degree movements:
     *
     * 0 -> 1 = 0deg -> 45deg
     * 1 -> 2 = 45deg -> 90deg
     * ...
     * 7 -> 8 = 315deg -> 360deg
     *
     * Each movement preserves the original two-part easing.
     */
    const spinnerSteps = Array.from(
      { length: DEVICE_SWITCH_SPINNER_STEP_COUNT },
      (_, stepIndex) => {
        const stepStart = stepIndex;
        const stepMiddle = stepStart + 0.5;
        const stepEnd = stepStart + 1;

        return [
          Animated.timing(deviceSwitchSpinnerAnim, {
            toValue: stepMiddle,
            duration: DEVICE_SWITCH_SPINNER_FIRST_HALF_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(deviceSwitchSpinnerAnim, {
            toValue: stepEnd,
            duration: DEVICE_SWITCH_SPINNER_SECOND_HALF_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ];
      },
    ).flat();

    const spinnerAnimation = Animated.loop(
      Animated.sequence(spinnerSteps),
      {
        iterations: -1,
        resetBeforeIteration: true,
      },
    );

    spinnerAnimation.start();

    return () => {
      spinnerAnimation.stop();
      deviceSwitchSpinnerAnim.stopAnimation();
    };
  }, [deviceSwitchOverlayMounted, deviceSwitchSpinnerAnim]);

  useEffect(() => {
    if (deviceSwitchCancellingRef.current) {
      return;
    }

    if (!deviceSwitchOverlayMounted || !switchingDeviceHost) {
      if (deviceSwitchCancelTimerRef.current !== null) {
        clearTimeout(deviceSwitchCancelTimerRef.current);
        deviceSwitchCancelTimerRef.current = null;
      }

      resetDeviceSwitchCancelButton();
      return;
    }

    const elapsed = Date.now() - deviceSwitchStartedAtRef.current;
    const delay = Math.max(
      0,
      DEVICE_SWITCH_CANCEL_DELAY_MS - elapsed,
    );

    deviceSwitchCancelTimerRef.current = setTimeout(() => {
      deviceSwitchCancelTimerRef.current = null;

      setDeviceSwitchCancelVisible(true);
      deviceSwitchCancelAnim.setValue(0);

      Animated.timing(deviceSwitchCancelAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, delay);

    return () => {
      if (deviceSwitchCancelTimerRef.current !== null) {
        clearTimeout(deviceSwitchCancelTimerRef.current);
        deviceSwitchCancelTimerRef.current = null;
      }
    };
  }, [
    deviceSwitchCancelAnim,
    deviceSwitchOverlayMounted,
    switchingDeviceHost,
  ]);

  useEffect(
    () => () => {
      clearDeviceSwitchTimers();

      deviceSwitchOverlayAnim.stopAnimation();
      deviceSwitchSpinnerAnim.stopAnimation();
      deviceSwitchCancelAnim.stopAnimation();
    },
    [
      deviceSwitchCancelAnim,
      deviceSwitchOverlayAnim,
      deviceSwitchSpinnerAnim,
    ],
  );

  function switchSavedDevice(device: SavedDevice) {
    if (device.host === host && status === "connected") {
      setDeviceDropdownOpen(false);
      return;
    }

    clearDeviceSwitchTimers();
    resetDeviceSwitchCancelButton();

    const snapshot = createDeviceSwitchSnapshot({
      capabilities: hostCapabilities,
      display: hostDisplay,
      getSelectedDevicePlatform,
      host,
      hostName,
      platform: hostPlatform,
      status,
    });

    previousDeviceRef.current = snapshot
      ? {
          host,
          name: hostName,
        }
      : null;

    setDeviceSwitchUiSnapshot(snapshot);

    deviceSwitchStartedAtRef.current = Date.now();

    setSwitchingDeviceHost(device.host);
    setSwitchingDeviceName(device.name);
    setDeviceSwitchOverlayMounted(true);

    deviceSwitchOverlayAnim.stopAnimation();
    deviceSwitchOverlayAnim.setValue(0);

    Animated.timing(deviceSwitchOverlayAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    selectSavedDevice(device);
  }

  function cancelDeviceSwitch() {
    if (deviceSwitchCancellingRef.current) {
      return;
    }

    const previousDevice = previousDeviceRef.current;

    clearDeviceSwitchTimers();

    deviceSwitchCancellingRef.current = true;
    previousDeviceRef.current = null;

    if (
      previousDevice?.host &&
      previousDevice.host !== switchingDeviceHost
    ) {
      cancelPendingConnection();
    } else {
      cancelConnection();
    }

    Animated.timing(deviceSwitchOverlayAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setDeviceSwitchOverlayMounted(false);
      setSwitchingDeviceHost("");
      setSwitchingDeviceName("");

      deviceSwitchCancellingRef.current = false;

      setDeviceSwitchUiSnapshot(null);
      resetDeviceSwitchCancelButton();
    });
  }

  const deviceSwitchOverlayAnimatedStyle = {
    opacity: deviceSwitchOverlayAnim,
    transform: [
      {
        scale: deviceSwitchOverlayAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
      {
        translateY: deviceSwitchOverlayAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  const deviceSwitchSpinnerAnimatedStyle = {
    transform: [
      {
        rotate: deviceSwitchSpinnerAnim.interpolate({
          inputRange: [0, DEVICE_SWITCH_SPINNER_STEP_COUNT],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };

  const deviceSwitchCancelAnimatedStyle = {
    maxHeight: deviceSwitchCancelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 42],
    }),
    opacity: deviceSwitchCancelAnim,
    transform: [
      {
        scale: deviceSwitchCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1],
        }),
      },
      {
        translateY: deviceSwitchCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }),
      },
    ],
  };

  return {
    cancelDeviceSwitch,
    deviceSwitchCancelAnimatedStyle,
    deviceSwitchCancelVisible,
    deviceSwitchOverlayAnimatedStyle,
    deviceSwitchOverlayMounted,
    deviceSwitchSpinnerAnimatedStyle,
    deviceSwitchUiSnapshot,
    switchingDeviceName,
    switchSavedDevice,
  };
}