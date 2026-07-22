import { Ionicons } from "@expo/vector-icons";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Pause as PauseIcon, Play as PlayIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppSplashOverlay } from "../../components/AppSplashOverlay";
import { FloatingIconOverlay } from "../../components/FloatingIconOverlay";
import { ScanGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import { createAppTourSteps } from "../../components/tour/tourSteps";
import { useAppTour } from "../../components/tour/useAppTour";
import { Trackpad } from "../trackpad/Trackpad";
import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
} from "../../types/protocol";
import { RemoteSocket } from "../../websocket/RemoteSocket";
import { withHaptic } from "../../utils/haptics";
import { sanitizeHostName } from "../connection/deviceUtils";
import { useRemoteConnection } from "../connection/useRemoteConnection";
import type { SavedDevice } from "../connection/types";
import { useRemoteSettings } from "../settings/useRemoteSettings";
import { useCustomShortcuts } from "../shortcuts/useCustomShortcuts";
import type { CustomShortcut } from "../shortcuts/types";
import { ShortcutEditorModal } from "../shortcuts/ShortcutEditorModal";
import { useHostProfile } from "./useHostProfile";
import { useRemoteActions } from "./useRemoteActions";
import { useRemoteControlsAvailability } from "./useRemoteControlsAvailability";
import { RemoteControlMasterHeader } from "./RemoteControlMasterHeader";
import { RemoteKeyboard, type RemoteKeyboardHandle } from "./Keyboard";
import { Shortcuts } from "./Shortcuts";
import { ControlActionButtons } from "./ControlActionButtons";
import { RemoteControlMasterFooter } from "./RemoteControlMasterFooter";
import type { QRScannerHandle } from "./QRScanner";
import {
  RemoteSettingsPanel,
  type RemoteSettingsHandle,
} from "./Settings";

const DEVICE_SWITCH_MIN_OVERLAY_MS = 1000;
const DEVICE_SWITCH_CANCEL_DELAY_MS = 3000;
const CONNECTION_CANCEL_DELAY_MS = 3000;
const BODY_HORIZONTAL_PADDING = 10;

interface DeviceSwitchUiSnapshot {
  host: string;
  name: string;
  platform: HostPlatform | null;
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
}

interface RemoteControlMasterProps {
  showInitialSplash?: boolean;
}

export function RemoteControlMaster({
  showInitialSplash = true,
}: RemoteControlMasterProps) {
  const socket = useMemo(() => new RemoteSocket(), []);
  const {
    handleRestartTour,
    setTourAutoStartEnabled,
    setTourSteps,
  } = useAppTour();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardRef = useRef<RemoteKeyboardHandle | null>(null);
  const qrScannerRef = useRef<QRScannerHandle | null>(null);
  const settingsRef = useRef<RemoteSettingsHandle | null>(null);
  const deviceSwitchStartedAtRef = useRef(0);
  const deviceSwitchDismissTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const deviceSwitchCancelTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const connectionCancelTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const previousDeviceRef = useRef<{ host: string; name?: string } | null>(
    null,
  );
  const deviceSwitchCancellingRef = useRef(false);

  const [scannerVisible, setScannerVisible] = useState(false);
  const {
    applyHostProfile,
    hostCapabilities,
    hostDisplay,
    hostPlatform,
    resetHostProfile,
  } = useHostProfile();
  const controlsAvailability = useRemoteControlsAvailability({
    capabilities: hostCapabilities,
    display: hostDisplay,
    platform: hostPlatform,
  });
  const remoteActions = useRemoteActions(socket);
  const {
    authError,
    cancelConnection,
    cancelPendingConnection,
    connectionHydrated,
    connectToHost,
    deleteSavedDevice,
    deviceDropdownOpen,
    host,
    hostName,
    latencyMs,
    persistHostName,
    persistHostPlatform,
    renameSavedDevice,
    savedDevices,
    selectSavedDevice,
    setConnectionError,
    setDeviceDropdownOpen,
    status,
  } = useRemoteConnection(socket, {
    onResetHostState: () => {
      resetHostProfile();
    },
    onUnmount: () => {},
  });
  const {
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling,
  } = useRemoteSettings(host);
  const [screenLayoutHeight, setScreenLayoutHeight] = useState(windowHeight);
  const [appSplashReleased, setAppSplashReleased] = useState(
    !showInitialSplash,
  );
  const [deviceSwitchOverlayMounted, setDeviceSwitchOverlayMounted] =
    useState(false);
  const [deviceSwitchCancelVisible, setDeviceSwitchCancelVisible] =
    useState(false);
  const [deviceSwitchUiSnapshot, setDeviceSwitchUiSnapshot] =
    useState<DeviceSwitchUiSnapshot | null>(null);
  const [connectionCancelVisible, setConnectionCancelVisible] = useState(false);
  const [switchingDeviceName, setSwitchingDeviceName] = useState("");
  const [switchingDeviceHost, setSwitchingDeviceHost] = useState("");
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const {
    closeShortcutModal,
    customShortcuts,
    deleteCustomShortcut,
    editingShortcutId,
    openEditShortcutModal,
    openShortcutModal,
    pickShortcutIcon,
    saveCustomShortcut,
    setShortcutIconUri,
    setShortcutName,
    setShortcutWebsite,
    shortcutFormError,
    shortcutIconKey,
    shortcutIconUri,
    shortcutModalVisible,
    shortcutName,
    shortcutWebsite,
  } = useCustomShortcuts();
  const deviceSwitchOverlayAnim = useRef(new Animated.Value(0)).current;
  const deviceSwitchSpinnerAnim = useRef(new Animated.Value(0)).current;
  const deviceSwitchCancelAnim = useRef(new Animated.Value(0)).current;
  const connectionSpinnerAnim = useRef(new Animated.Value(0)).current;
  const connectionCancelAnim = useRef(new Animated.Value(0)).current;
  const showConnectionPrompt =
    status !== "connected" && !deviceSwitchOverlayMounted;
  const connectionInProgress = status === "connecting";
  const appSplashReadyToDismiss =
    connectionHydrated &&
    (!host.trim() ||
      status === "idle" ||
      status === "disconnected" ||
      status === "error" ||
      (status === "connecting" && connectionCancelVisible) ||
      (status === "connected" && hostPlatform !== null));

  useEffect(() => {
    if (!showInitialSplash) {
      setAppSplashReleased(true);
      return;
    }

    if (appSplashReadyToDismiss) {
      setAppSplashReleased(true);
    }
  }, [appSplashReadyToDismiss, showInitialSplash]);

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        applyHostProfile(message);
        persistHostPlatform(message.platform);

        const nextHostName = sanitizeHostName(message.hostName);

        const savedDevice = savedDevices.find((device) => device.host === host);

        if (nextHostName && !savedDevice) {
          persistHostName(nextHostName);
        }
      }
    });

    return unsubscribe;
  }, [
    applyHostProfile,
    host,
    persistHostName,
    persistHostPlatform,
    savedDevices,
    socket,
  ]);

  useEffect(() => {
    if (!switchingDeviceHost || status !== "connected" || !hostPlatform) {
      return;
    }

    if (host !== switchingDeviceHost) {
      return;
    }

    if (deviceSwitchDismissTimerRef.current !== null) {
      clearTimeout(deviceSwitchDismissTimerRef.current);
      deviceSwitchDismissTimerRef.current = null;
    }

    const elapsed = Date.now() - deviceSwitchStartedAtRef.current;
    const remaining = Math.max(0, DEVICE_SWITCH_MIN_OVERLAY_MS - elapsed);

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
          setDeviceSwitchOverlayMounted(false);
          setSwitchingDeviceHost("");
          setSwitchingDeviceName("");
          previousDeviceRef.current = null;
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

    deviceSwitchSpinnerAnim.setValue(0);
    const spinnerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(deviceSwitchSpinnerAnim, {
          toValue: 0.5,
          duration: 820,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(deviceSwitchSpinnerAnim, {
          toValue: 1,
          duration: 860,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    spinnerAnimation.start();

    return () => {
      spinnerAnimation.stop();
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
      setDeviceSwitchCancelVisible(false);
      deviceSwitchCancelAnim.stopAnimation();
      deviceSwitchCancelAnim.setValue(0);
      return;
    }

    const elapsed = Date.now() - deviceSwitchStartedAtRef.current;
    const delay = Math.max(0, DEVICE_SWITCH_CANCEL_DELAY_MS - elapsed);

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

  useEffect(() => {
    if (status !== "connecting" || deviceSwitchOverlayMounted) {
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
      resetConnectionCancelButton();
      return;
    }

    connectionCancelTimerRef.current = setTimeout(() => {
      connectionCancelTimerRef.current = null;
      setConnectionCancelVisible(true);
      connectionCancelAnim.setValue(0);
      Animated.timing(connectionCancelAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, CONNECTION_CANCEL_DELAY_MS);

    return () => {
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
    };
  }, [connectionCancelAnim, deviceSwitchOverlayMounted, status]);

  useEffect(() => {
    if (!connectionInProgress || deviceSwitchOverlayMounted) {
      connectionSpinnerAnim.stopAnimation();
      connectionSpinnerAnim.setValue(0);
      return;
    }

    connectionSpinnerAnim.setValue(0);
    const spinnerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(connectionSpinnerAnim, {
          toValue: 0.5,
          duration: 820,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(connectionSpinnerAnim, {
          toValue: 1,
          duration: 860,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    spinnerAnimation.start();

    return () => {
      spinnerAnimation.stop();
    };
  }, [
    connectionInProgress,
    connectionSpinnerAnim,
    deviceSwitchOverlayMounted,
  ]);

  useEffect(
    () => () => {
      if (deviceSwitchDismissTimerRef.current !== null) {
        clearTimeout(deviceSwitchDismissTimerRef.current);
        deviceSwitchDismissTimerRef.current = null;
      }
      if (deviceSwitchCancelTimerRef.current !== null) {
        clearTimeout(deviceSwitchCancelTimerRef.current);
        deviceSwitchCancelTimerRef.current = null;
      }
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
    },
    [],
  );

  function sendCustomShortcut(shortcut: CustomShortcut) {
    remoteActions.openCustomShortcut(shortcut);
  }

  function sendSleep() {
    socket.sendSleep();
  }

  function getSelectedDevicePlatform(
    activeHost = host,
    activePlatform: HostPlatform | null = hostPlatform,
  ): HostPlatform | undefined {
    const selectedDevice = savedDevices.find(
      (device) => device.host === activeHost,
    );

    return activePlatform ?? selectedDevice?.platform;
  }

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

  function resetConnectionCancelButton() {
    setConnectionCancelVisible(false);
    connectionCancelAnim.stopAnimation();
    connectionCancelAnim.setValue(0);
  }

  function switchSavedDevice(device: SavedDevice) {
    if (device.host === host && status === "connected") {
      setDeviceDropdownOpen(false);
      return;
    }

    clearDeviceSwitchTimers();
    resetDeviceSwitchCancelButton();

    const hasActiveDevice = status === "connected" && host.trim().length > 0;
    previousDeviceRef.current = hasActiveDevice
      ? { host, name: hostName }
      : null;
    setDeviceSwitchUiSnapshot(
      hasActiveDevice
        ? {
          host,
          name: hostName,
          platform: hostPlatform ?? getSelectedDevicePlatform(host) ?? null,
          capabilities: hostCapabilities,
          display: hostDisplay,
        }
        : null,
    );
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

    if (previousDevice?.host && previousDevice.host !== switchingDeviceHost) {
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
      if (finished) {
        setDeviceSwitchOverlayMounted(false);
        setSwitchingDeviceHost("");
        setSwitchingDeviceName("");
        deviceSwitchCancellingRef.current = false;
        setDeviceSwitchUiSnapshot(null);
        resetDeviceSwitchCancelButton();
      }
    });
  }

  function switchPrimaryHorizontal(direction: "left" | "right") {
    if (hostPlatform === "win32") {
      remoteActions.switchWindow(direction === "left" ? "previous" : "next");
      return;
    }

    remoteActions.switchWorkspace(direction);
  }

  function toggleRemotePlayback() {
    socket.sendTextCommand(playbackPaused ? "mediaPlay" : "mediaPause");
    setPlaybackPaused((current) => !current);
  }

  function handleScreenLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    setScreenLayoutHeight((current) =>
      current === nextHeight ? current : nextHeight,
    );
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
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };
  const connectionSpinnerAnimatedStyle = {
    transform: [
      {
        rotate: connectionSpinnerAnim.interpolate({
          inputRange: [0, 1],
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
  const connectionCancelAnimatedStyle = {
    maxHeight: connectionCancelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 42],
    }),
    opacity: connectionCancelAnim,
    transform: [
      {
        scale: connectionCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1],
        }),
      },
      {
        translateY: connectionCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }),
      },
    ],
  };
  const visibleHostPlatform = deviceSwitchUiSnapshot?.platform ?? hostPlatform;
  const visibleHostCapabilities =
    deviceSwitchUiSnapshot?.capabilities ?? hostCapabilities;
  const visibleHostDisplay = deviceSwitchUiSnapshot?.display ?? hostDisplay;
  const visibleStatus = deviceSwitchUiSnapshot ? "connected" : status;
  const visibleControlsAvailability = useRemoteControlsAvailability({
    capabilities: visibleHostCapabilities,
    display: visibleHostDisplay,
    platform: visibleHostPlatform,
  });
  const {
    overviewAvailable,
    overviewLabel,
    sleepAvailable,
    switchWindowAvailable,
    switchWorkspaceAvailable,
  } = visibleControlsAvailability;
  const isWindowsHost = visibleHostPlatform === "win32";
  const primarySwitchAvailable = isWindowsHost
    ? switchWindowAvailable
    : switchWorkspaceAvailable;
  const PlaybackIcon = playbackPaused ? PlayIcon : PauseIcon;
  const visibleDeviceHost = deviceSwitchUiSnapshot?.host ?? host;
  const visibleDeviceName = deviceSwitchUiSnapshot?.name ?? hostName;
  const closeTourKeyboard = useCallback(() => {
    keyboardRef.current?.close();
  }, []);
  const closeTourSettings = useCallback(() => {
    settingsRef.current?.close();
  }, []);
  const tourSteps = useMemo(
    () =>
      createAppTourSteps({
        capabilities: visibleHostCapabilities,
        closeKeyboard: closeTourKeyboard,
        closeSettings: closeTourSettings,
        platform: visibleHostPlatform,
      }),
    [
      closeTourKeyboard,
      closeTourSettings,
      visibleHostCapabilities,
      visibleHostPlatform,
    ],
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

  return (
    <SafeAreaView style={styles.screen} onLayout={handleScreenLayout}>
      {deviceDropdownOpen ? (
        <Pressable
          accessibilityLabel="Close device list"
          style={styles.deviceDropdownDismissLayer}
          onPressIn={() => setDeviceDropdownOpen(false)}
        />
      ) : null}

      <Modal
        animationType="none"
        transparent
        visible={deviceSwitchOverlayMounted}
      >
        <Animated.View
          accessibilityLabel="Connecting to device"
          accessibilityRole="alert"
          onStartShouldSetResponder={() => true}
          style={styles.deviceSwitchOverlay}
        >
          <FloatingIconOverlay
            active={deviceSwitchOverlayMounted}
            maxOpacity={0.26}
            spawnIntervalMs={520}
          />
          <Animated.View
            style={[styles.deviceSwitchCard, deviceSwitchOverlayAnimatedStyle]}
          >
            <View style={styles.deviceSwitchSpinner}>
              <Animated.View style={deviceSwitchSpinnerAnimatedStyle}>
                <Ionicons name="radio" size={22} color="#f0a942" />
              </Animated.View>
            </View>
            <Text style={styles.deviceSwitchTitle}>Connecting</Text>
            <Text style={styles.deviceSwitchText} numberOfLines={1}>
              {switchingDeviceName || "Selected device"}
            </Text>
            {deviceSwitchCancelVisible ? (
              <Animated.View
                style={[
                  styles.deviceSwitchCancelSlot,
                  deviceSwitchCancelAnimatedStyle,
                ]}
              >
                <Pressable
                  accessibilityLabel="Cancel device connection"
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.deviceSwitchCancelButton,
                    pressed ? styles.deviceSwitchCancelButtonPressed : null,
                  ]}
                  onPress={withHaptic(cancelDeviceSwitch)}
                >
                  <Ionicons name="close" size={16} color="#f7f5f1" />
                  <Text style={styles.deviceSwitchCancelText}>Cancel</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Modal>

      <RemoteControlMasterHeader
        deviceDropdownOpen={deviceDropdownOpen}
        onConnectToHost={connectToHost}
        onDeleteDevice={deleteSavedDevice}
        onDeviceDropdownOpenChange={setDeviceDropdownOpen}
        onRenameDevice={renameSavedDevice}
        onScannerOpenStart={() => {
          settingsRef.current?.close();
          setDeviceDropdownOpen(false);
        }}
        onScannerVisibilityChange={setScannerVisible}
        onScanError={setConnectionError}
        onSettingsToggleStart={() => setDeviceDropdownOpen(false)}
        onSleep={!showConnectionPrompt && sleepAvailable ? sendSleep : undefined}
        onSwitchDevice={switchSavedDevice}
        qrScannerRef={qrScannerRef}
        savedDevices={savedDevices}
        settingsDisabled={showConnectionPrompt}
        settingsRef={settingsRef}
        visibleDeviceHost={visibleDeviceHost}
        visibleDeviceName={visibleDeviceName}
        visibleHostPlatform={visibleHostPlatform}
      />

      <RemoteKeyboard
        ref={keyboardRef}
        hostPlatform={visibleHostPlatform}
        screenLayoutHeight={screenLayoutHeight}
        socket={socket}
      />

      <RemoteSettingsPanel
        ref={settingsRef}
        controlsAvailability={visibleControlsAvailability}
        hostDisplay={visibleHostDisplay}
        hostName={visibleDeviceName}
        onRestartTour={handleRestartTour}
        sensitivity={sensitivity}
        setSensitivity={setSensitivity}
        setUnnaturalScrolling={setUnnaturalScrolling}
        socket={socket}
        status={status}
        unnaturalScrolling={unnaturalScrolling}
      />

      <View style={styles.remoteControls}>
        {showConnectionPrompt ? (
          <View style={styles.connectionPrompt}>
            <FloatingIconOverlay active={showConnectionPrompt} maxOpacity={0.26} />
            {connectionInProgress ? (
              <Animated.View
                accessibilityLabel="Connecting to host"
                accessibilityRole="alert"
                style={styles.deviceSwitchCard}
              >
                <View style={styles.deviceSwitchSpinner}>
                  <Animated.View style={connectionSpinnerAnimatedStyle}>
                    <Ionicons name="sync" size={22} color="#f0a942" />
                  </Animated.View>
                </View>
                <Text style={styles.deviceSwitchTitle}>Connecting</Text>
                <Text style={styles.deviceSwitchText} numberOfLines={1}>
                  {hostName || host || "Selected device"}
                </Text>
                {connectionCancelVisible ? (
                  <Animated.View
                    style={[
                      styles.deviceSwitchCancelSlot,
                      connectionCancelAnimatedStyle,
                    ]}
                  >
                    <Pressable
                      accessibilityLabel="Cancel connection"
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.deviceSwitchCancelButton,
                        pressed ? styles.deviceSwitchCancelButtonPressed : null,
                      ]}
                      onPress={withHaptic(cancelConnection)}
                    >
                      <Ionicons name="close" size={16} color="#f7f5f1" />
                      <Text style={styles.deviceSwitchCancelText}>Cancel</Text>
                    </Pressable>
                  </Animated.View>
                ) : null}
              </Animated.View>
            ) : (
              <ScanGradientButton
                accessibilityLabel="Scan to connect to host"
                action={() => qrScannerRef.current?.open()}
                buttonStyle={styles.connectionPromptButton}
                colors={[
                  "rgba(44, 33, 23, 0.72)",
                  "rgba(24, 20, 16, 0.72)",
                  "rgba(14, 13, 11, 0.72)",
                ]}
                end={{ x: 0.9, y: 1 }}
                gradientStyle={styles.connectionPromptButtonGradient}
                icon={
                  <Ionicons name="scan-outline" size={23} color="#f0a942" />
                }
                label="Scan to Connect"
                labelStyle={styles.connectionPromptButtonText}
                pressedStyle={styles.mouseButtonPressed}
                start={{ x: 0.1, y: 0 }}
              />
            )}
            {authError ? (
              <Text style={styles.connectionPromptError}>{authError}</Text>
            ) : null}
          </View>
        ) : (
          <>
            <Shortcuts
              onAddShortcut={openShortcutModal}
              onEditShortcut={openEditShortcutModal}
              onShortcutPress={sendCustomShortcut}
              shortcuts={customShortcuts}
            />

            <ControlActionButtons
              isWindowsHost={isWindowsHost}
              onBrowserBack={() => socket.sendTextCommand("browserBack")}
              onBrowserForward={() => socket.sendTextCommand("browserForward")}
              onCloseTab={() => socket.sendTextCommand("closeTab")}
              onEscape={() => socket.sendKey("escape")}
              onLeftArrow={() => socket.sendKey("leftArrow")}
              onPrimarySwitch={switchPrimaryHorizontal}
              onRightArrow={() => socket.sendKey("rightArrow")}
              primarySwitchAvailable={primarySwitchAvailable}
            />

            <View
              style={styles.trackpadWrap}
              onStartShouldSetResponder={() =>
                keyboardRef.current?.isVisible() ?? false
              }
              onResponderRelease={() => {
                keyboardRef.current?.close();
              }}
            >
              <TourTarget targetKey="trackpad" style={styles.trackpadTourTarget}>
                <Trackpad
                  latencyMs={latencyMs}
                  onMove={(dx, dy) =>
                    socket.sendMove(dx * sensitivity, dy * sensitivity)
                  }
                  onClick={() => socket.sendLeftClick()}
                  onDoubleClick={() => socket.sendDoubleClick()}
                  onRightClick={() => socket.sendRightClick()}
                  onScroll={(dx, dy) => {
                    const direction = unnaturalScrolling ? -1 : 1;
                    socket.sendScroll(dx * direction, dy * direction);
                  }}
                  onZoom={(direction) => socket.sendZoom(direction)}
                  onSwipeSpaces={(direction) => {
                    if (primarySwitchAvailable) {
                      switchPrimaryHorizontal(direction);
                    }
                  }}
                  status={visibleStatus}
                />
              </TourTarget>
            </View>

            <RemoteControlMasterFooter
              isWindowsHost={isWindowsHost}
              keyboardRef={keyboardRef}
              onCloseTab={() => socket.sendTextCommand("closeTab")}
              onEscape={() => socket.sendKey("escape")}
              onReload={() => socket.sendTextCommand("reload")}
              onRightClick={() => socket.sendRightClick()}
              onShowOverview={remoteActions.showOverview}
              onTogglePlayback={toggleRemotePlayback}
              overviewAvailable={overviewAvailable}
              overviewLabel={overviewLabel}
              playbackIcon={PlaybackIcon}
              playbackPaused={playbackPaused}
            />
          </>
        )}
      </View>

      <ShortcutEditorModal
        editingShortcutId={editingShortcutId}
        formError={shortcutFormError}
        iconKey={shortcutIconKey}
        iconUri={shortcutIconUri}
        isVisible={shortcutModalVisible}
        name={shortcutName}
        onChangeIconUri={setShortcutIconUri}
        onChangeName={setShortcutName}
        onChangeWebsite={setShortcutWebsite}
        onClose={closeShortcutModal}
        onDelete={deleteCustomShortcut}
        onPickIcon={pickShortcutIcon}
        onSave={saveCustomShortcut}
        website={shortcutWebsite}
      />
      <AppSplashOverlay visible={!appSplashReleased} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#070707",
    flex: 1,
    gap: 12,
    paddingBottom: 14,
  },
  deviceDropdownDismissLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 40,
  },
  deviceSwitchOverlay: {
    alignItems: "center",
    backgroundColor: "#070707",
    bottom: 0,
    flex: 1,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2000,
  },
  deviceSwitchCard: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    minWidth: 210,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.38,
    shadowRadius: 26,
  },
  deviceSwitchSpinner: {
    alignItems: "center",
    backgroundColor: "rgba(240, 169, 66, 0.1)",
    borderColor: "rgba(240, 169, 66, 0.34)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  deviceSwitchTitle: {
    color: "#f7f5f1",
    fontSize: 15,
    fontWeight: "900",
  },
  deviceSwitchText: {
    color: "#f8aa34",
    fontSize: 14,
    fontWeight: "700",
    maxWidth: 190,
    borderWidth: 1,
    borderColor: '#f0aa42c9',
    backgroundColor: '#f0aa422b',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginVertical: 6
  },
  deviceSwitchCancelSlot: {
    marginTop: 4,
    overflow: "hidden",
  },
  deviceSwitchCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  deviceSwitchCancelButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    transform: [{ scale: 0.98 }],
  },
  deviceSwitchCancelText: {
    color: "#f7f5f1",
    fontSize: 13,
    fontWeight: "800",
  },
  remoteControls: {
    flex: 1,
    gap: 12,
    minHeight: 0,
    position: "relative",
  },
  connectionPrompt: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
    position: "relative",
  },
  connectionPromptButton: {
    backgroundColor: "rgba(31, 25, 18, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.62)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    zIndex: 1,
  },
  connectionPromptButtonDisabled: {
    opacity: 0.84,
  },
  connectionPromptButtonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 58,
    overflow: "hidden",
    paddingHorizontal: 22,
  },
  connectionPromptButtonText: {
    color: "#f0a942",
    fontSize: 15,
    fontWeight: "900",
  },
  connectionCancelSlot: {
    marginTop: 12,
    overflow: "hidden",
    zIndex: 1,
  },
  connectionCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 38,
    justifyContent: "center",
    minWidth: 112,
    paddingHorizontal: 16,
  },
  connectionCancelButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    transform: [{ scale: 0.98 }],
  },
  connectionCancelText: {
    color: "#f7f5f1",
    fontSize: 13,
    fontWeight: "800",
  },
  connectionPromptError: {
    color: "#ff8a72",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 14,
    maxWidth: 310,
    textAlign: "center",
    zIndex: 1,
  },
  trackpadWrap: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  trackpadTourTarget: {
    flex: 1,
    minHeight: 0,
  },
  mouseButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
