import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import {
  CameraView,
  type ScanningResult,
  useCameraPermissions,
} from "expo-camera";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  type KeyboardEvent,
  type LayoutChangeEvent,
  Modal,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import {
  ClockArrowLeft as ClockArrowLeftIcon,
  ClockArrowRight as ClockArrowRightIcon,
  Keyboard as KeyboardIcon,
  LayoutPanelTop as LayoutPanelTopIcon,
  Minimize2 as Minimize2Icon,
  MouseRight as MouseRightIcon,
  PanelRightClose as PanelRightCloseIcon,
  PanelRightOpen as PanelRightOpenIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  RefreshCw as RefreshCwIcon,
  SquareX as SquareXIcon,
  Volume2 as VolumeOnIcon,
  VolumeX as VolumeMutedIcon,
  Pencil,
  Undo2,
  Redo2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppSplashOverlay } from "../../components/AppSplashOverlay";
import { FloatingIconOverlay } from "../../components/FloatingIconOverlay";
import { Header } from "../../components/Header";
import { ShortcutButton } from "../../components/ShortcutButton";
import { Trackpad } from "../trackpad/Trackpad";
import type {
  HostCapabilities,
  HostDisplayInfo,
  HostPlatform,
  ShortcutId,
  TextCommand,
} from "../../types/protocol";
import { RemoteSocket } from "../../websocket/RemoteSocket";
import { withHaptic } from "../../utils/haptics";
import DisneyPlusIcon from "../../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../../assets/shortcuts/netflix.svg";
import PrimeIcon from "../../assets/shortcuts/prime.svg";
import SpotifyIcon from "../../assets/shortcuts/spotify.svg";
import AppleIcon from "../../assets/icons/apple.svg";
import WindowsIcon from "../../assets/icons/windows.svg";
import { sanitizeHostName } from "../connection/deviceUtils";
import { parsePairingPayload } from "../connection/pairing";
import { useRemoteConnection } from "../connection/useRemoteConnection";
import type { SavedDevice } from "../connection/types";
import { RESTART_COUNTDOWN_SECONDS } from "../settings/constants";
import { SettingsBottomSheet } from "../settings/SettingsBottomSheet";
import { useRemoteSettings } from "../settings/useRemoteSettings";
import { useHostMedia } from "../media/useHostMedia";
import {
  formatPercent,
  formatStep,
  MEDIA_CONTROL_STEPS,
} from "../media/mediaUtils";
import { TEXT_SEND_CHUNK_SIZE } from "../keyboard/constants";
import { useCustomShortcuts } from "../shortcuts/useCustomShortcuts";
import type { CustomShortcut } from "../shortcuts/types";
import { ShortcutEditorModal } from "../shortcuts/ShortcutEditorModal";
import { useHostProfile } from "./useHostProfile";
import { useRemoteActions } from "./useRemoteActions";
import { useRemoteControlsAvailability } from "./useRemoteControlsAvailability";

const ScanButtonGradient =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;
const DEVICE_NAME_MIN_LENGTH = 2;
const DEVICE_NAME_MAX_LENGTH = 20;
const DEVICE_DROPDOWN_MAX_HEIGHT = 286;
const DEVICE_SWITCH_MIN_OVERLAY_MS = 1000;
const DEVICE_SWITCH_CANCEL_DELAY_MS = 3000;
const CONNECTION_CANCEL_DELAY_MS = 3000;
const BODY_HORIZONTAL_PADDING = 10;
const SHORTCUT_GAP = 8;
const SHORTCUT_VISIBLE_COUNT = 5;
const SHORTCUT_MIN_SIZE = 54;
const SHORTCUT_MAX_SIZE = 70;
const KEYBOARD_PANEL_KEYBOARD_GAP = 12;
const KEYBOARD_PANEL_TOP = 106;
const KEYBOARD_PANEL_RESTING_BOTTOM = 112;

interface DeviceSwitchUiSnapshot {
  host: string;
  name: string;
  platform: HostPlatform | null;
  capabilities: HostCapabilities | null;
  display: HostDisplayInfo | null;
}

export function RemoteControlMaster() {
  const socket = useMemo(() => new RemoteSocket(), []);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const keyboardInputRef = useRef<TextInput>(null);
  const keyboardActiveRef = useRef(false);
  const fullScreenLayoutHeightRef = useRef(windowHeight);
  const bufferRef = useRef("");
  const keyboardSelectionRef = useRef({ start: 0, end: 0 });
  const remoteKeyboardCursorRef = useRef(0);
  const remoteKeyboardSelectionActiveRef = useRef(false);
  const scannerOpenRef = useRef(false);
  const deviceDropdownAnim = useRef(new Animated.Value(0)).current;
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

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerZoom, setScannerZoom] = useState(0.2);
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
    adjustVolumeStep,
    applyHostState,
    brightness,
    brightnessAdjustable,
    clearBrightnessCommitTimer,
    handleBrightnessSlideComplete,
    handleBrightnessSlideStart,
    handleBrightnessValueChange,
    resetHostMedia,
    toggleMute,
    volume,
    volumeAdjustable,
    volumeButtonColor,
    volumeMuted,
    volumeStep,
  } = useHostMedia(socket, controlsAvailability);
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
      resetHostMedia();
    },
    onUnmount: clearBrightnessCommitTimer,
  });
  const {
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling,
  } = useRemoteSettings(host);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const [keyboardBuffer, setKeyboardBuffer] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [screenLayoutHeight, setScreenLayoutHeight] = useState(windowHeight);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardOverlay, setKeyboardOverlay] = useState(false);
  const [keyboardUiMounted, setKeyboardUiMounted] = useState(false);
  const [appSplashReleased, setAppSplashReleased] = useState(false);
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
  const [typedText, setTypedText] = useState("");
  const [keyboardSelection, setKeyboardSelection] = useState({
    start: 0,
    end: 0,
  });
  const [keyboardInputKey, setKeyboardInputKey] = useState(0);
  const [deviceDropdownMounted, setDeviceDropdownMounted] = useState(false);
  const [renamingDevice, setRenamingDevice] = useState<SavedDevice | null>(
    null,
  );
  const [renameDeviceName, setRenameDeviceName] = useState("");
  const [renameDeviceError, setRenameDeviceError] = useState("");
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
    shortcutIconUri,
    shortcutModalVisible,
    shortcutName,
    shortcutWebsite,
  } = useCustomShortcuts();
  const keyboardPanelAnim = useRef(new Animated.Value(0)).current;
  const deviceSwitchOverlayAnim = useRef(new Animated.Value(0)).current;
  const deviceSwitchSpinnerAnim = useRef(new Animated.Value(0)).current;
  const deviceSwitchCancelAnim = useRef(new Animated.Value(0)).current;
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
    if (appSplashReadyToDismiss) {
      setAppSplashReleased(true);
    }
  }, [appSplashReadyToDismiss]);

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        applyHostProfile(message);
        applyHostState(message);
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
    applyHostState,
    host,
    persistHostName,
    persistHostPlatform,
    savedDevices,
    socket,
  ]);

  useEffect(() => {
    if (deviceDropdownOpen) {
      setDeviceDropdownMounted(true);
      Animated.timing(deviceDropdownAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      return;
    }

    Animated.timing(deviceDropdownAnim, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setDeviceDropdownMounted(false);
      }
    });
  }, [deviceDropdownAnim, deviceDropdownOpen]);

  useEffect(() => {
    if (showSettings && status === "connected") {
      socket.requestHostState();
    }
  }, [showSettings, socket, status]);

  useEffect(() => {
    if (restartCountdown === null) {
      return;
    }

    if (restartCountdown <= 0) {
      setRestartCountdown(null);
      return;
    }

    const timeout = setTimeout(() => {
      setRestartCountdown((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }, 1000);

    return () => clearTimeout(timeout);
  }, [restartCountdown]);

  useEffect(() => {
    const resolveKeyboardHeight = (event: KeyboardEvent) => {
      const frame = event.endCoordinates;
      const heightFromScreenY =
        typeof frame.screenY === "number"
          ? Math.max(0, windowHeight - frame.screenY)
          : 0;
      const nextHeight =
        Platform.OS === "android"
          ? heightFromScreenY
          : Math.max(heightFromScreenY, frame.height ?? 0);

      setKeyboardHeight(Math.round(nextHeight));
      setKeyboardVisible(true);
    };

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });
    const showSub = Keyboard.addListener(
      "keyboardDidShow",
      resolveKeyboardHeight,
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [windowHeight]);

  useEffect(() => {
    if (keyboardOverlay || keyboardVisible) {
      return;
    }

    fullScreenLayoutHeightRef.current = Math.max(
      fullScreenLayoutHeightRef.current,
      screenLayoutHeight,
      windowHeight,
    );
  }, [keyboardOverlay, keyboardVisible, screenLayoutHeight, windowHeight]);

  useEffect(() => {
    if (!keyboardVisible) {
      keyboardActiveRef.current = false;
      setKeyboardOverlay(false);
      clearKeyboardInput();
    }
  }, [keyboardVisible]);

  useEffect(() => {
    if (keyboardOverlay) {
      setKeyboardUiMounted(true);
      keyboardPanelAnim.setValue(0);
      Animated.timing(keyboardPanelAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(keyboardPanelAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setKeyboardUiMounted(false);
      }
    });
  }, [keyboardOverlay, keyboardPanelAnim]);

  useEffect(() => {
    if (keyboardOverlay && keyboardUiMounted) {
      refocusKeyboardInput();
    }
  }, [keyboardOverlay, keyboardUiMounted]);

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

  function toggleSettings() {
    setDeviceDropdownOpen(false);
    setShowSettings((visible) => !visible);
  }

  function clearKeyboardInput() {
    keyboardInputRef.current?.setNativeProps({ text: "" });
    bufferRef.current = "";
    keyboardSelectionRef.current = { start: 0, end: 0 };
    remoteKeyboardCursorRef.current = 0;
    remoteKeyboardSelectionActiveRef.current = false;
    setKeyboardBuffer("");
    setTypedText("");
    setKeyboardSelection({ start: 0, end: 0 });
    setKeyboardInputKey((current) => current + 1);
  }

  function clearKeyboardTextArea() {
    keyboardInputRef.current?.setNativeProps({ text: "" });
    bufferRef.current = "";
    keyboardSelectionRef.current = { start: 0, end: 0 };
    remoteKeyboardCursorRef.current = 0;
    remoteKeyboardSelectionActiveRef.current = false;
    setKeyboardBuffer("");
    setTypedText("");
    setKeyboardSelection({ start: 0, end: 0 });
  }

  function dismissKeyboardInput() {
    keyboardActiveRef.current = false;
    Keyboard.dismiss();
    setKeyboardOverlay(false);
    clearKeyboardInput();
  }

  function sendShortcut(shortcut: ShortcutId) {
    remoteActions.openShortcut(shortcut);
  }

  function sendCustomShortcut(shortcut: CustomShortcut) {
    remoteActions.openCustomShortcut(shortcut);
  }

  function sendSleep() {
    socket.sendSleep();
  }

  function sendRestartHost() {
    setRestartCountdown(RESTART_COUNTDOWN_SECONDS);
    socket.sendRestartHost();
  }

  function confirmRestartHost() {
    if (status !== "connected" || restartCountdown !== null) {
      return;
    }

    Alert.alert(
      "Restart host?",
      `This will force restart ${hostName || "the connected computer"} now. Unsaved documents and terminal sessions may be closed without another prompt.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Restart",
          style: "destructive",
          onPress: sendRestartHost,
        },
      ],
    );
  }

  async function openScanner() {
    const permission =
      cameraPermission?.granted === true
        ? cameraPermission
        : await requestCameraPermission();

    if (!permission.granted) {
      setConnectionError();
      return;
    }

    scannerOpenRef.current = true;
    setShowSettings(false);
    setDeviceDropdownOpen(false);
    setScannerVisible(true);
  }

  function closeScanner() {
    scannerOpenRef.current = false;
    setScannerVisible(false);
  }

  function openRenameDevice(device: SavedDevice) {
    setRenamingDevice(device);
    setRenameDeviceName(device.name);
    setRenameDeviceError("");
  }

  function closeRenameDevice() {
    setRenamingDevice(null);
    setRenameDeviceName("");
    setRenameDeviceError("");
  }

  function saveRenamedDevice() {
    if (!renamingDevice) {
      return;
    }

    const cleanName = renameDeviceName.trim();
    const duplicate = savedDevices.some(
      (device) =>
        device.id !== renamingDevice.id &&
        device.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    if (cleanName.length < DEVICE_NAME_MIN_LENGTH) {
      setRenameDeviceError("Use at least 2 letters.");
      return;
    }

    if (cleanName.length > DEVICE_NAME_MAX_LENGTH) {
      setRenameDeviceError("Use 20 letters or fewer.");
      return;
    }

    if (duplicate) {
      setRenameDeviceError("That device name is already used.");
      return;
    }

    renameSavedDevice(renamingDevice, cleanName);
    closeRenameDevice();
  }

  function getDevicePlatform(
    device: SavedDevice,
    activeHost = host,
    activePlatform: HostPlatform | null = hostPlatform,
  ): HostPlatform | undefined {
    if (device.host === activeHost && activePlatform) {
      return activePlatform;
    }

    return device.platform;
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

  function handleScannerBarcode(event: { data: string }) {
    if (!scannerOpenRef.current) {
      return;
    }

    scannerOpenRef.current = false;
    setScannerVisible(false);
    connectFromScan(event);
  }

  function connectFromScan(event: Pick<ScanningResult, "data">) {
    const pairing = parsePairingPayload(event.data);

    if (!pairing) {
      setConnectionError();
      return;
    }

    connectToHost(pairing.url, pairing.hostName, pairing.pairingToken);
  }

  function focusKeyboard() {
    keyboardActiveRef.current = true;
    keyboardInputRef.current?.blur();
    clearKeyboardInput();
    setKeyboardOverlay(true);

    if (Platform.OS === "android") {
      keyboardInputRef.current?.focus();
    }

    refocusKeyboardInput();
  }

  function refocusKeyboardInput() {
    const focusInput = () => {
      keyboardInputRef.current?.focus();
    };

    requestAnimationFrame(focusInput);
    setTimeout(focusInput, 80);

    if (Platform.OS === "android") {
      setTimeout(focusInput, 180);
      setTimeout(focusInput, 320);
    }
  }

  function sendTextChunk(text: string) {
    const pieces = text.split("\n");

    pieces.forEach((piece, index) => {
      for (
        let offset = 0;
        offset < piece.length;
        offset += TEXT_SEND_CHUNK_SIZE
      ) {
        socket.sendText(piece.slice(offset, offset + TEXT_SEND_CHUNK_SIZE));
      }

      if (index < pieces.length - 1) {
        socket.sendKey("enter");
      }
    });
  }

  function syncRemoteKeyboardCursor(targetIndex: number) {
    const boundedTarget = Math.max(
      0,
      Math.min(bufferRef.current.length, targetIndex),
    );
    const delta = boundedTarget - remoteKeyboardCursorRef.current;

    if (delta !== 0) {
      socket.moveCaret(delta > 0 ? "right" : "left", Math.abs(delta));
    }

    remoteKeyboardCursorRef.current = boundedTarget;
    remoteKeyboardSelectionActiveRef.current = false;
  }

  function switchPrimaryHorizontal(direction: "left" | "right") {
    if (hostPlatform === "win32") {
      remoteActions.switchWindow(direction === "left" ? "previous" : "next");
      return;
    }

    remoteActions.switchWorkspace(direction);
  }

  function setLocalKeyboardSelection(start: number, end = start) {
    const nextSelection = { start, end };
    keyboardSelectionRef.current = nextSelection;
    setKeyboardSelection(nextSelection);
  }

  function updateKeyboardBuffer(nextText: string, nextCursor: number) {
    bufferRef.current = nextText;
    remoteKeyboardCursorRef.current = nextCursor;
    setLocalKeyboardSelection(nextCursor);
    setKeyboardBuffer(nextText);
    setTypedText(nextText);
  }

  function handleKeyboardTextChange(nextText: string) {
    if (!keyboardActiveRef.current) {
      return;
    }

    const prev = bufferRef.current;

    if (nextText === prev) {
      return;
    }

    const activeSelection = keyboardSelectionRef.current;
    const selectedAllRemotely =
      remoteKeyboardSelectionActiveRef.current &&
      activeSelection.start === 0 &&
      activeSelection.end === prev.length;

    if (selectedAllRemotely) {
      if (nextText.length === 0) {
        socket.sendKey("backspace");
      } else {
        sendTextChunk(nextText);
      }

      remoteKeyboardSelectionActiveRef.current = false;
      updateKeyboardBuffer(nextText, nextText.length);
      return;
    }

    let prefixLength = 0;
    while (
      prefixLength < prev.length &&
      prefixLength < nextText.length &&
      prev[prefixLength] === nextText[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < prev.length - prefixLength &&
      suffixLength < nextText.length - prefixLength &&
      prev[prev.length - 1 - suffixLength] ===
        nextText[nextText.length - 1 - suffixLength]
    ) {
      suffixLength += 1;
    }

    const deletedCount = prev.length - prefixLength - suffixLength;
    const insertedText = nextText.slice(
      prefixLength,
      nextText.length - suffixLength,
    );

    syncRemoteKeyboardCursor(prefixLength + deletedCount);

    for (let index = 0; index < deletedCount; index += 1) {
      socket.sendKey("backspace");
    }

    if (insertedText.length > 0) {
      sendTextChunk(insertedText);
    }

    if (insertedText.includes("\n")) {
      clearKeyboardTextArea();
      return;
    }

    updateKeyboardBuffer(nextText, prefixLength + insertedText.length);
  }

  function handleKeyboardSelectionChange(
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) {
    const { selection } = event.nativeEvent;

    if (hostPlatform === "win32" && keyboardActiveRef.current) {
      const remoteCursor = remoteKeyboardCursorRef.current;

      if (selection.start !== remoteCursor || selection.end !== remoteCursor) {
        setLocalKeyboardSelection(remoteCursor);
      }

      return;
    }

    keyboardSelectionRef.current = selection;
    setKeyboardSelection(selection);

    if (!keyboardActiveRef.current) {
      return;
    }

    if (selection.start !== selection.end) {
      return;
    }

    syncRemoteKeyboardCursor(selection.end);
  }

  function handleKeyboardKeyPress(
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) {
    if (
      keyboardActiveRef.current &&
      event.nativeEvent.key === "Backspace" &&
      bufferRef.current.length === 0
    ) {
      socket.sendKey("backspace");
    }
  }

  function sendKeyboardShortcut(command: TextCommand) {
    socket.sendTextCommand(command);

    if (command === "selectAll") {
      remoteKeyboardSelectionActiveRef.current = true;
      setLocalKeyboardSelection(0, bufferRef.current.length);
    }

    if (command === "clear") {
      clearKeyboardTextArea();
    }

    refocusKeyboardInput();
  }

  function insertKeyboardText(
    text: string,
    sendMode: "type" | "newLine" | "paste" = "type",
  ) {
    if (!text) {
      refocusKeyboardInput();
      return;
    }

    const prev = bufferRef.current;
    const selection = keyboardSelectionRef.current;
    const selectionStart = Math.max(
      0,
      Math.min(selection.start, selection.end),
    );
    const selectionEnd = Math.min(
      prev.length,
      Math.max(selection.start, selection.end),
    );
    const nextText =
      prev.slice(0, selectionStart) + text + prev.slice(selectionEnd);
    const selectedAllRemotely =
      remoteKeyboardSelectionActiveRef.current &&
      selectionStart === 0 &&
      selectionEnd === prev.length;

    if (selectedAllRemotely) {
      if (sendMode === "newLine") {
        socket.sendTextCommand("newLine");
      } else if (sendMode === "paste") {
        socket.pasteText(text);
      } else {
        sendTextChunk(text);
      }
    } else {
      syncRemoteKeyboardCursor(selectionEnd);

      for (let index = 0; index < selectionEnd - selectionStart; index += 1) {
        socket.sendKey("backspace");
      }

      if (sendMode === "newLine") {
        socket.sendTextCommand("newLine");
      } else if (sendMode === "paste") {
        socket.pasteText(text);
      } else {
        sendTextChunk(text);
      }
    }

    remoteKeyboardSelectionActiveRef.current = false;
    updateKeyboardBuffer(nextText, selectionStart + text.length);

    refocusKeyboardInput();
  }

  function insertKeyboardNewLine() {
    insertKeyboardText("\n", "newLine");
  }

  async function pasteFromPhoneClipboard() {
    refocusKeyboardInput();
    const clipboardText = await Clipboard.getStringAsync();
    insertKeyboardText(clipboardText, "paste");
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

  const androidKeyboardPanelTop = clamp(Math.round(windowHeight * 0.08), 54, 76);
  const androidKeyboardPanelGap = clamp(Math.round(windowHeight * 0.09), 56, 82);
  const currentWindowHeight = Dimensions.get("window").height;
  const androidWindowShrinkInset =
    keyboardOverlay && Platform.OS === "android"
      ? Math.max(0, fullScreenLayoutHeightRef.current - currentWindowHeight)
      : 0;
  const androidParentAlreadyResized =
    keyboardOverlay &&
    Platform.OS === "android" &&
    screenLayoutHeight < fullScreenLayoutHeightRef.current - 48;
  const keyboardPanelInset =
    keyboardOverlay && Platform.OS === "android" && !androidParentAlreadyResized
      ? Math.max(keyboardHeight, androidWindowShrinkInset)
      : keyboardHeight;
  const keyboardPanelTop =
    keyboardOverlay && Platform.OS === "android"
      ? androidKeyboardPanelTop
      : KEYBOARD_PANEL_TOP;
  const keyboardPanelKeyboardGap =
    keyboardOverlay && Platform.OS === "android"
      ? androidKeyboardPanelGap
      : KEYBOARD_PANEL_KEYBOARD_GAP;
  const keyboardPanelBottom = keyboardOverlay
    ? keyboardPanelInset + keyboardPanelKeyboardGap
    : KEYBOARD_PANEL_RESTING_BOTTOM;
  const keyboardPanelDynamicStyle = {
    bottom: keyboardPanelBottom,
    top: keyboardPanelTop,
  };
  const keyboardPanelAnimatedStyle = {
    opacity: keyboardPanelAnim,
    transform: [
      {
        translateY: keyboardPanelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
      {
        scale: keyboardPanelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };
  const keyboardBackdropAnimatedStyle = {
    opacity: keyboardPanelAnim,
  };
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
      outputRange: [0, 44],
    }),
    opacity: connectionCancelAnim,
    transform: [
      {
        scale: connectionCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.88, 1],
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
  const monitorName = visibleHostDisplay?.name ?? "Unknown monitor";
  const monitorMeta = visibleHostDisplay
    ? visibleHostDisplay.isTv
      ? "TV detected"
      : "Display detected"
    : "Connect to host for display details";
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
  const scannerCameraSize = Math.max(
    240,
    Math.min(windowWidth - 64, windowHeight - 236, 420),
  );
  const PlaybackIcon = playbackPaused ? PlayIcon : PauseIcon;
  const keyboardShortcutColumns = windowWidth >= 390 ? 5 : 4;
  const keyboardShortcutGap = 8;
  const keyboardShortcutContentWidth = Math.max(0, windowWidth - 64);
  const keyboardShortcutButtonWidth =
    (keyboardShortcutContentWidth -
      keyboardShortcutGap * (keyboardShortcutColumns - 1)) /
    keyboardShortcutColumns;
  const keyboardShortcutButtonStyle = {
    width: Math.max(58, Math.floor(keyboardShortcutButtonWidth)),
  };
  const shortcutButtonSize = clamp(
    Math.floor(
      (windowWidth -
        BODY_HORIZONTAL_PADDING * 2 -
        SHORTCUT_GAP * (SHORTCUT_VISIBLE_COUNT - 1)) /
        SHORTCUT_VISIBLE_COUNT,
    ),
    SHORTCUT_MIN_SIZE,
    SHORTCUT_MAX_SIZE,
  );
  const shortcutsScrollerStyle = {
    height: shortcutButtonSize,
  };
  const visibleDeviceHost = deviceSwitchUiSnapshot?.host ?? host;
  const visibleDeviceName = deviceSwitchUiSnapshot?.name ?? hostName;
  const selectedDevicePlatform = getSelectedDevicePlatform(
    visibleDeviceHost,
    visibleHostPlatform,
  );
  const deviceDropdownHorizontalInset = BODY_HORIZONTAL_PADDING;
  const deviceDropdownAnimatedStyle = {
    marginLeft: 0,
    maxHeight: deviceDropdownAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, DEVICE_DROPDOWN_MAX_HEIGHT],
    }),
    opacity: deviceDropdownAnim,
    transform: [
      {
        translateY: deviceDropdownAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
    width: Math.max(0, windowWidth - deviceDropdownHorizontalInset * 2),
  };
  const deviceDropdownChevronAnimatedStyle = {
    transform: [
      {
        rotate: deviceDropdownAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "180deg"],
        }),
      },
    ],
  };
  const devicePickerTitle = visibleDeviceName || "No device saved";

  return (
    <SafeAreaView style={styles.screen} onLayout={handleScreenLayout}>
      {keyboardUiMounted ? (
        <Animated.View
          style={[styles.keyboardBg, keyboardBackdropAnimatedStyle]}
        >
          <Pressable
            style={styles.keyboardBgPressable}
            onPress={dismissKeyboardInput}
          />
        </Animated.View>
      ) : null}

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
            maxOpacity={0.16}
            spawnIntervalMs={520}
          />
          <Animated.View
            style={[styles.deviceSwitchCard, deviceSwitchOverlayAnimatedStyle]}
          >
            <View style={styles.deviceSwitchSpinner}>
              <Animated.View style={deviceSwitchSpinnerAnimatedStyle}>
                <Ionicons name="sync" size={22} color="#f0a942" />
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

      <Header
        latencyMs={latencyMs}
        status={visibleStatus}
        titleContent={
          <View style={styles.homeDevicePicker}>
            <Pressable
              accessibilityLabel="Select host"
              style={({ pressed }) => [
                styles.homeDeviceButton,
                pressed ? styles.homeDeviceButtonPressed : null,
              ]}
              onPress={withHaptic(() => setDeviceDropdownOpen((open) => !open))}
            >
              <View style={styles.homeDeviceIcon}>
                <DevicePlatformIcon
                  platform={selectedDevicePlatform}
                  size={16}
                />
              </View>
              <Text
                style={styles.homeDeviceName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {devicePickerTitle}
              </Text>
              <Animated.View style={deviceDropdownChevronAnimatedStyle}>
                <Ionicons name="chevron-down" size={19} color="#b7b2ab" />
              </Animated.View>
            </Pressable>
            {deviceDropdownMounted ? (
              <Animated.View
                style={[styles.homeDeviceDropdown, deviceDropdownAnimatedStyle]}
              >
                {savedDevices.length > 0 ? (
                  <ScrollView
                    style={styles.homeDeviceDropdownList}
                    showsVerticalScrollIndicator={false}
                  >
                    {savedDevices.map((device) => {
                      const selected = device.host === visibleDeviceHost;

                      return (
                        <View
                          key={device.id}
                          style={[
                            styles.homeDeviceOption,
                            selected ? styles.homeDeviceOptionSelected : null,
                          ]}
                        >
                          <Pressable
                            style={styles.homeDeviceOptionSelect}
                            onPress={withHaptic(() =>
                              switchSavedDevice(device),
                            )}
                          >
                            <View style={styles.homeDeviceOptionIcon}>
                              <DevicePlatformIcon
                                platform={getDevicePlatform(
                                  device,
                                  visibleDeviceHost,
                                  visibleHostPlatform,
                                )}
                                size={18}
                              />
                            </View>
                            <Text
                              style={styles.homeDeviceOptionName}
                              numberOfLines={1}
                            >
                              {device.name}
                            </Text>
                          </Pressable>
                          <View style={styles.homeDeviceOptionActions}>
                            {selected ? (
                              <View style={styles.homeDeviceSelectedMark}>
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color="#74f0a7"
                                />
                              </View>
                            ) : null}
                            <Pressable
                              accessibilityLabel={`Rename ${device.name}`}
                              style={styles.deviceEditButton}
                              onPress={withHaptic(() =>
                                openRenameDevice(device),
                              )}
                            >
                              <Pencil size={17} color="#ffffff" />
                            </Pressable>
                            <Pressable
                              accessibilityLabel={`Delete ${device.name}`}
                              style={styles.deviceDeleteButton}
                              onPress={withHaptic(() =>
                                deleteSavedDevice(device),
                              )}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color="#ff8a8a"
                              />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyDeviceText}>
                    Scan a desktop QR code to save it here.
                  </Text>
                )}
              </Animated.View>
            ) : null}
          </View>
        }
        onScan={openScanner}
        settingsDisabled={showConnectionPrompt}
        onToggleSettings={toggleSettings}
        onSleep={
          !showConnectionPrompt && sleepAvailable ? sendSleep : undefined
        }
      />

      <Animated.View
        style={[
          styles.keyboardPanel,
          keyboardUiMounted ? null : styles.keyboardPanelHidden,
          keyboardPanelDynamicStyle,
          keyboardPanelAnimatedStyle,
        ]}
        pointerEvents={keyboardUiMounted ? "auto" : "none"}
      >
        <View style={styles.keyboardPanelHeader}>
          <View style={styles.keyboardPanelTitleRow}>
            <View style={styles.keyboardPanelIcon}>
              <ScanButtonGradient
                colors={["#ffbd62", "#f0a942", "#b86a25"]}
                start={{ x: 0.18, y: 0 }}
                end={{ x: 0.82, y: 1 }}
                style={styles.keyboardPanelIconGradient}
              >
                <Ionicons name="keypad-outline" size={18} color="#1b1008" />
              </ScanButtonGradient>
            </View>
            <Text style={styles.keyboardPanelTitle}>Keyboard</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardPanelClose,
              pressed ? styles.keyboardPanelClosePressed : null,
            ]}
            onPress={withHaptic(dismissKeyboardInput)}
          >
            <ScanButtonGradient
              colors={["#4b211c", "#321917", "#1b1110"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardPanelCloseGradient}
            >
              <Ionicons name="close" size={20} color="#ff8a72" />
            </ScanButtonGradient>
          </Pressable>
        </View>

        <TextInput
          key={keyboardInputKey}
          ref={keyboardInputRef}
          value={keyboardBuffer}
          onChangeText={handleKeyboardTextChange}
          onKeyPress={handleKeyboardKeyPress}
          onSelectionChange={handleKeyboardSelectionChange}
          autoFocus={keyboardOverlay}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          multiline
          blurOnSubmit={false}
          keyboardAppearance="dark"
          selection={keyboardSelection}
          selectionColor="#ff941f"
          showSoftInputOnFocus
          style={[
            styles.keyboardPreview,
            typedText ? null : styles.keyboardPreviewEmpty,
          ]}
        />

        <View style={styles.keyboardShortcutGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(() => sendKeyboardShortcut("selectAll"))}
          >
            <ScanButtonGradient
              colors={["#2b211a", "#1b1714", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons name="scan-outline" size={18} color="#f0c17c" />
              <Text style={styles.keyboardShortcutText}>Select All</Text>
            </ScanButtonGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(insertKeyboardNewLine)}
          >
            <ScanButtonGradient
              colors={["#2b211a", "#1b1714", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons
                name="return-down-forward-outline"
                size={18}
                color="#f0c17c"
              />
              <Text style={styles.keyboardShortcutText}>New Line</Text>
            </ScanButtonGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(() => sendKeyboardShortcut("copy"))}
          >
            <ScanButtonGradient
              colors={["#2b211a", "#1b1714", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons name="copy-outline" size={18} color="#f0c17c" />
              <Text style={styles.keyboardShortcutText}>Copy</Text>
            </ScanButtonGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(() => sendKeyboardShortcut("paste"))}
          >
            <ScanButtonGradient
              colors={["#2b211a", "#1b1714", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons name="clipboard-outline" size={18} color="#f0c17c" />
              <Text style={styles.keyboardShortcutText}>Paste</Text>
            </ScanButtonGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(pasteFromPhoneClipboard)}
          >
            <ScanButtonGradient
              colors={["#3b2816", "#211811", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color="#f0a942"
              />
              <Text style={styles.keyboardShortcutText}>Paste Phone</Text>
            </ScanButtonGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.keyboardShortcutButton,
              keyboardShortcutButtonStyle,
              pressed ? styles.keyboardShortcutButtonPressed : null,
            ]}
            onPress={withHaptic(() => sendKeyboardShortcut("clear"))}
          >
            <ScanButtonGradient
              colors={["#342019", "#211613", "#11100e"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.keyboardShortcutGradient}
            >
              <Ionicons name="backspace-outline" size={18} color="#ffb08a" />
              <Text style={styles.keyboardShortcutText}>Clear</Text>
            </ScanButtonGradient>
          </Pressable>
        </View>
      </Animated.View>

      <SettingsBottomSheet isOpen={showSettings} onOpenChange={setShowSettings}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.settingsScroll}
          contentContainerStyle={styles.settingsContent}
        >
          <View style={styles.sensitivityCard}>
            <View style={styles.settingsCardHeader}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons name="tv-outline" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Current Monitor</Text>
              </View>
            </View>
            <View style={styles.monitorRow}>
              <View
                style={[
                  styles.monitorIcon,
                  visibleHostDisplay?.isTv ? styles.monitorIconTv : null,
                ]}
              >
                <Ionicons
                  name={
                    visibleHostDisplay?.isTv ? "tv-outline" : "desktop-outline"
                  }
                  size={22}
                  color="#ffffff"
                />
              </View>
              <View style={styles.hostTextBlock}>
                <Text style={styles.hostValue}>{monitorName}</Text>
                <Text style={styles.hostMeta}>{monitorMeta}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <View style={styles.settingsCardHeader}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons
                    name="speedometer-outline"
                    size={18}
                    color="#ffffff"
                  />
                </View>
                <Text style={styles.sensitivityLabel}>Sensitivity</Text>
              </View>
            </View>
            <View style={styles.sliderRow}>
              <Slider
                style={styles.slider}
                minimumValue={0.25}
                maximumValue={3}
                step={0.05}
                value={sensitivity}
                minimumTrackTintColor="#ff941f"
                maximumTrackTintColor="#33261b"
                thumbTintColor="#ffffff"
                onValueChange={setSensitivity}
              />
              <Text style={styles.sensitivityValue}>
                {sensitivity.toFixed(2)}x
              </Text>
            </View>
          </View>

          <View style={[styles.sensitivityCard, styles.settingToggleCard]}>
            <View style={styles.settingToggleRow}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons name="swap-vertical" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Unnatural scrolling</Text>
              </View>
              <View style={styles.settingSwitchWrap}>
                <Switch
                  ios_backgroundColor="#33261b"
                  onValueChange={setUnnaturalScrolling}
                  thumbColor={unnaturalScrolling ? "#ffffff" : "#a7a39d"}
                  trackColor={{ false: "#33261b", true: "#ff941f" }}
                  value={unnaturalScrolling}
                />
              </View>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <View style={styles.settingHeaderRow}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons name="sunny-outline" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Brightness</Text>
              </View>
              {visibleHostDisplay?.brightnessAdjustable === false ? (
                <Text style={styles.settingUnavailable}>Unavailable on TV</Text>
              ) : null}
            </View>
            <View style={styles.brightnessSliderWrap}>
              <View style={styles.mediaValueRow}>
                <Text
                  style={[
                    styles.mediaValueText,
                    !brightnessAdjustable ? styles.disabledText : null,
                  ]}
                >
                  {formatPercent(brightness)}
                </Text>
              </View>
              <View style={styles.brightnessSliderRow}>
                <Ionicons
                  name="sunny-outline"
                  size={17}
                  color={brightnessAdjustable ? "#a7a39d" : "#5c554e"}
                />
                {showSettings && brightness !== null ? (
                  <Slider
                    disabled={!brightnessAdjustable}
                    maximumTrackTintColor="#33261b"
                    maximumValue={100}
                    minimumTrackTintColor={
                      brightnessAdjustable ? "#ffb347" : "#3a2a1e"
                    }
                    minimumValue={0}
                    onSlidingComplete={handleBrightnessSlideComplete}
                    onSlidingStart={handleBrightnessSlideStart}
                    onValueChange={handleBrightnessValueChange}
                    step={1}
                    style={styles.slider}
                    thumbTintColor={
                      brightnessAdjustable ? "#ffffff" : "#66594c"
                    }
                    value={brightness}
                  />
                ) : (
                  <View style={styles.slider} />
                )}
                <Ionicons
                  name="sunny"
                  size={18}
                  color={brightnessAdjustable ? "#ffb347" : "#5c554e"}
                />
              </View>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <View style={styles.settingHeaderRow}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons
                    name="volume-high-outline"
                    size={18}
                    color="#ffffff"
                  />
                </View>
                <Text style={styles.sensitivityLabel}>Volume</Text>
              </View>
              <View style={styles.settingHeaderActions}>
                {visibleHostDisplay?.volumeAdjustable === false ? (
                  <Text style={styles.settingUnavailable}>
                    Unavailable on TV
                  </Text>
                ) : null}
                <Pressable
                  accessibilityLabel={
                    volumeMuted ? "Unmute volume" : "Mute volume"
                  }
                  accessibilityRole="button"
                  disabled={!volumeAdjustable}
                  hitSlop={8}
                  onPress={withHaptic(toggleMute)}
                  style={[
                    styles.volumeMuteButton,
                    !volumeAdjustable ? styles.disabledControl : null,
                  ]}
                >
                  {volumeMuted ? (
                    <VolumeMutedIcon color={volumeButtonColor} />
                  ) : (
                    <VolumeOnIcon color={volumeButtonColor} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.mediaControlRow}>
              <Pressable
                disabled={
                  !volumeAdjustable || volumeStep === null || volumeStep === 0
                }
                style={[
                  styles.mediaStepButton,
                  !volumeAdjustable || volumeStep === null || volumeStep === 0
                    ? styles.disabledControl
                    : null,
                ]}
                onPress={withHaptic(() => adjustVolumeStep(-1))}
              >
                <Ionicons name="remove" size={22} color="#ffffff" />
              </Pressable>
              <View style={styles.mediaLevelWrap}>
                <View style={styles.mediaValueRow}>
                  <Text
                    style={[
                      styles.mediaValueText,
                      !volumeAdjustable ? styles.disabledText : null,
                    ]}
                  >
                    {formatPercent(volume)}
                  </Text>
                  <Text
                    style={[
                      styles.mediaStepText,
                      !volumeAdjustable ? styles.disabledText : null,
                    ]}
                  >
                    {formatStep(volumeStep)}
                  </Text>
                </View>
                <View style={styles.mediaTickRow}>
                  {Array.from({ length: MEDIA_CONTROL_STEPS }).map(
                    (_, index) => (
                      <View
                        key={`volume-${index}`}
                        style={[
                          styles.mediaTick,
                          volumeStep !== null && index < volumeStep
                            ? styles.volumeTickActive
                            : null,
                          !volumeAdjustable ? styles.disabledControl : null,
                        ]}
                      />
                    ),
                  )}
                </View>
              </View>
              <Pressable
                disabled={
                  !volumeAdjustable ||
                  volumeStep === null ||
                  volumeStep === MEDIA_CONTROL_STEPS
                }
                style={[
                  styles.mediaStepButton,
                  !volumeAdjustable ||
                  volumeStep === null ||
                  volumeStep === MEDIA_CONTROL_STEPS
                    ? styles.disabledControl
                    : null,
                ]}
                onPress={withHaptic(() => adjustVolumeStep(1))}
              >
                <Ionicons name="add" size={22} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <View style={styles.settingsCardHeader}>
              <View style={styles.settingsCardTitleRow}>
                <View style={[styles.settingsCardIcon, styles.dangerIcon]}>
                  <Ionicons name="power" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Host Power</Text>
              </View>
            </View>
            <Pressable
              disabled={status !== "connected" || restartCountdown !== null}
              style={[
                styles.restartHostButton,
                status !== "connected" || restartCountdown !== null
                  ? styles.disabledControl
                  : null,
              ]}
              onPress={withHaptic(confirmRestartHost)}
            >
              <Ionicons
                name="reload-circle-outline"
                size={22}
                color="#ffffff"
              />
              <Text style={styles.restartHostText}>
                {restartCountdown === null
                  ? "Force Restart Host"
                  : `Restarting in ${restartCountdown}s`}
              </Text>
            </Pressable>
            {restartCountdown !== null ? (
              <Text style={styles.restartHostMeta}>
                Waiting for macOS restart window to finish.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </SettingsBottomSheet>

      <View style={styles.remoteControls}>
        {showConnectionPrompt ? (
          <View style={styles.connectionPrompt}>
            <FloatingIconOverlay active={showConnectionPrompt} />
            <Pressable
              accessibilityLabel={
                connectionInProgress
                  ? "Connecting to host"
                  : "Scan to connect to host"
              }
              accessibilityRole="button"
              disabled={connectionInProgress}
              onPress={withHaptic(openScanner)}
              style={({ pressed }) => [
                styles.connectionPromptButton,
                connectionInProgress
                  ? styles.connectionPromptButtonDisabled
                  : null,
                pressed && !connectionInProgress
                  ? styles.mouseButtonPressed
                  : null,
              ]}
            >
              <ScanButtonGradient
                colors={[
                  "rgba(44, 33, 23, 0.72)",
                  "rgba(24, 20, 16, 0.72)",
                  "rgba(14, 13, 11, 0.72)",
                ]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.connectionPromptButtonGradient}
              >
                <Ionicons
                  name={connectionInProgress ? "sync" : "scan-outline"}
                  size={23}
                  color="#f0a942"
                />
                <Text style={styles.connectionPromptButtonText}>
                  {connectionInProgress ? "Connecting..." : "Scan to Connect"}
                </Text>
              </ScanButtonGradient>
            </Pressable>
            {connectionInProgress && connectionCancelVisible ? (
              <Animated.View
                style={[
                  styles.connectionCancelSlot,
                  connectionCancelAnimatedStyle,
                ]}
              >
                <Pressable
                  accessibilityLabel="Cancel connection"
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.connectionCancelButton,
                    pressed ? styles.connectionCancelButtonPressed : null,
                  ]}
                  onPress={withHaptic(cancelConnection)}
                >
                  <Ionicons name="close" size={16} color="#f7f5f1" />
                  <Text style={styles.connectionCancelText}>Cancel</Text>
                </Pressable>
              </Animated.View>
            ) : null}
            {authError ? (
              <Text style={styles.connectionPromptError}>{authError}</Text>
            ) : null}
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.shortcutsScroller, shortcutsScrollerStyle]}
              contentContainerStyle={styles.shortcuts}
            >
              <ShortcutButton
                SvgIcon={NetflixIcon}
                label="Netflix"
                onPress={() => sendShortcut("netflix")}
                size={shortcutButtonSize}
              />
              <ShortcutButton
                icon="logo-youtube"
                iconColor="#ff0033"
                label="YouTube"
                onPress={() => sendShortcut("youtube")}
                size={shortcutButtonSize}
              />
              <ShortcutButton
                SvgIcon={DisneyPlusIcon}
                label="Disney+"
                onPress={() => sendShortcut("disney")}
                size={shortcutButtonSize}
              />
              <ShortcutButton
                SvgIcon={PrimeIcon}
                label="Amazon Prime"
                onPress={() => sendShortcut("amazon")}
                size={shortcutButtonSize}
              />
              <ShortcutButton
                SvgIcon={SpotifyIcon}
                label="Spotify"
                onPress={() => sendShortcut("spotify")}
                size={shortcutButtonSize}
              />
              {customShortcuts.map((shortcut) => (
                <ShortcutButton
                  key={shortcut.id}
                  imageUri={shortcut.iconUri}
                  initial={shortcut.name}
                  label={shortcut.name}
                  onPress={() => sendCustomShortcut(shortcut)}
                  onLongPress={() => openEditShortcutModal(shortcut)}
                  size={shortcutButtonSize}
                />
              ))}
              <ShortcutButton
                icon="add"
                iconColor="#ff941f"
                label="Add Shortcut"
                onPress={openShortcutModal}
                size={shortcutButtonSize}
              />
            </ScrollView>

            <View style={styles.controlShortcutRow}>
              <View style={styles.shortcutGroup}>
                {isWindowsHost ? (
                  <>
                    <Pressable
                      style={styles.desktopSwitchButton}
                      accessibilityLabel="Escape key"
                      onPress={withHaptic(() => socket.sendKey("escape"))}
                    >
                      <Minimize2Icon size={22} color="#b8afa5" />
                    </Pressable>
                    <View style={styles.shortcutDivider} />
                    <Pressable
                      style={styles.desktopSwitchButton}
                      accessibilityLabel="Close current browser tab"
                      onPress={withHaptic(() =>
                        socket.sendTextCommand("closeTab"),
                      )}
                    >
                      <SquareXIcon size={22} color="#b8afa5" />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      disabled={!primarySwitchAvailable}
                      style={[
                        styles.desktopSwitchButton,
                        !primarySwitchAvailable ? styles.disabledControl : null,
                      ]}
                      accessibilityLabel="Previous desktop"
                      onPress={withHaptic(() =>
                        switchPrimaryHorizontal("left"),
                      )}
                    >
                      <PanelRightOpenIcon size={22} color="#b8afa5" />
                    </Pressable>
                    <View style={styles.shortcutDivider} />
                    <Pressable
                      disabled={!primarySwitchAvailable}
                      style={[
                        styles.desktopSwitchButton,
                        !primarySwitchAvailable ? styles.disabledControl : null,
                      ]}
                      accessibilityLabel="Next desktop"
                      onPress={withHaptic(() =>
                        switchPrimaryHorizontal("right"),
                      )}
                    >
                      <PanelRightCloseIcon size={22} color="#b8afa5" />
                    </Pressable>
                  </>
                )}
              </View>

              <View style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}>
                <Pressable
                  style={styles.desktopSwitchButton}
                  accessibilityLabel="Previous browser page"
                  onPress={withHaptic(() =>
                    socket.sendTextCommand("browserBack"),
                  )}
                >
                  <Undo2 size={22} color="#f0c17c" />
                </Pressable>
                <View
                  style={[
                    styles.shortcutDivider,
                    styles.shortcutDividerPrimary,
                  ]}
                />
                <Pressable
                  style={styles.desktopSwitchButton}
                  accessibilityLabel="Next browser page"
                  onPress={withHaptic(() =>
                    socket.sendTextCommand("browserForward"),
                  )}
                >
                  <Redo2 size={22} color="#f0c17c" />
                </Pressable>
              </View>

              <View style={styles.shortcutGroup}>
                <Pressable
                  style={styles.desktopSwitchButton}
                  accessibilityLabel="Left arrow key"
                  onPress={withHaptic(() => socket.sendKey("leftArrow"))}
                >
                  <ClockArrowLeftIcon size={22} color="#9e9890" />
                </Pressable>
                <View style={styles.shortcutDivider} />
                <Pressable
                  style={styles.desktopSwitchButton}
                  accessibilityLabel="Right arrow key"
                  onPress={withHaptic(() => socket.sendKey("rightArrow"))}
                >
                  <ClockArrowRightIcon size={22} color="#9e9890" />
                </Pressable>
              </View>
            </View>

            <View
              style={styles.trackpadWrap}
              onStartShouldSetResponder={() => keyboardVisible}
              onResponderRelease={() => {
                if (keyboardVisible) {
                  dismissKeyboardInput();
                }
              }}
            >
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
            </View>

            {!isWindowsHost ? (
              <View style={styles.remoteActionRow}>
                <View
                  style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}
                >
                  <Pressable
                    style={styles.desktopSwitchButton}
                    accessibilityLabel="Escape key"
                    onPress={withHaptic(() => socket.sendKey("escape"))}
                  >
                    <Minimize2Icon size={22} color="#f0c17c" />
                  </Pressable>
                  <View
                    style={[
                      styles.shortcutDivider,
                      styles.shortcutDividerPrimary,
                    ]}
                  />
                  <Pressable
                    disabled={!overviewAvailable}
                    style={[
                      styles.desktopSwitchButton,
                      !overviewAvailable ? styles.disabledControl : null,
                    ]}
                    accessibilityLabel={overviewLabel}
                    onPress={withHaptic(remoteActions.showOverview)}
                  >
                    <LayoutPanelTopIcon size={22} color="#f0c17c" />
                  </Pressable>
                  <View
                    style={[
                      styles.shortcutDivider,
                      styles.shortcutDividerPrimary,
                    ]}
                  />
                  <Pressable
                    style={styles.desktopSwitchButton}
                    accessibilityLabel={
                      playbackPaused ? "Play media" : "Pause media"
                    }
                    onPress={withHaptic(toggleRemotePlayback)}
                  >
                    <PlaybackIcon size={22} color="#f0c17c" />
                  </Pressable>
                  <View
                    style={[
                      styles.shortcutDivider,
                      styles.shortcutDividerPrimary,
                    ]}
                  />
                  <Pressable
                    style={styles.desktopSwitchButton}
                    accessibilityLabel="Close current browser tab"
                    onPress={withHaptic(() =>
                      socket.sendTextCommand("closeTab"),
                    )}
                  >
                    <SquareXIcon size={22} color="#f0c17c" />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.mouseButtonRow}>
              <Pressable
                accessibilityLabel="Refresh"
                style={({ pressed }) => [
                  styles.mouseButton,
                  styles.mouseButtonSide,
                  pressed ? styles.mouseButtonPressed : null,
                ]}
                onPress={withHaptic(() => socket.sendTextCommand("reload"))}
              >
                <ScanButtonGradient
                  colors={["#2b211a", "#1b1714", "#11100e"]}
                  start={{ x: 0.18, y: 0 }}
                  end={{ x: 0.82, y: 1 }}
                  style={styles.sideMouseButtonGradient}
                >
                  <RefreshCwIcon size={23} color="#ffffff" />
                </ScanButtonGradient>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.mouseButton,
                  styles.keyboardMouseButton,
                  pressed ? styles.mouseButtonPressed : null,
                ]}
                onPress={withHaptic(
                  keyboardVisible ? dismissKeyboardInput : focusKeyboard,
                )}
              >
                <ScanButtonGradient
                  colors={[
                    "rgba(44, 33, 23, 0.72)",
                    "rgba(24, 20, 16, 0.72)",
                    "rgba(14, 13, 11, 0.72)",
                  ]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.keyboardMouseButtonGradient}
                >
                  <KeyboardIcon size={23} color="#f0a942" />
                  <Text
                    style={[styles.mouseButtonText, styles.accentButtonText]}
                  >
                    Keyboard
                  </Text>
                </ScanButtonGradient>
              </Pressable>
              <Pressable
                accessibilityLabel="Right Click"
                style={({ pressed }) => [
                  styles.mouseButton,
                  styles.mouseButtonSide,
                  pressed ? styles.mouseButtonPressed : null,
                ]}
                onPress={withHaptic(() => socket.sendRightClick())}
              >
                <ScanButtonGradient
                  colors={["#2b211a", "#1b1714", "#11100e"]}
                  start={{ x: 0.18, y: 0 }}
                  end={{ x: 0.82, y: 1 }}
                  style={styles.sideMouseButtonGradient}
                >
                  <MouseRightIcon size={23} color="#ffffff" />
                </ScanButtonGradient>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={scannerVisible}
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerBackdrop}>
          <View style={styles.scannerSheet}>
            <View style={styles.scannerHeader}>
              <View style={styles.scannerTitleRow}>
                <View style={styles.scannerIcon}>
                  <Ionicons name="qr-code-outline" size={20} color="#1b1008" />
                </View>
                <Text style={styles.scannerTitle}>Scan Desktop QR</Text>
              </View>
              <Pressable
                style={styles.scannerCloseButton}
                onPress={withHaptic(closeScanner)}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </Pressable>
            </View>

            <View
              style={[
                styles.scannerCameraFrame,
                {
                  height: scannerCameraSize,
                  width: scannerCameraSize,
                },
              ]}
            >
              <CameraView
                active={scannerVisible}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                facing="back"
                onBarcodeScanned={
                  scannerVisible ? handleScannerBarcode : undefined
                }
                style={styles.scannerCamera}
                zoom={scannerZoom}
              />
              <View pointerEvents="none" style={styles.scannerGuide}>
                <View
                  style={[styles.scannerCorner, styles.scannerCornerTopLeft]}
                />
                <View
                  style={[styles.scannerCorner, styles.scannerCornerTopRight]}
                />
                <View
                  style={[styles.scannerCorner, styles.scannerCornerBottomLeft]}
                />
                <View
                  style={[
                    styles.scannerCorner,
                    styles.scannerCornerBottomRight,
                  ]}
                />
              </View>
            </View>

            <View style={styles.scannerZoomRow}>
              <Ionicons name="remove" size={18} color="#cec8be" />
              <Slider
                style={styles.scannerZoomSlider}
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={scannerZoom}
                minimumTrackTintColor="#ff941f"
                maximumTrackTintColor="#33261b"
                thumbTintColor="#ffffff"
                onValueChange={setScannerZoom}
              />
              <Ionicons name="add" size={18} color="#cec8be" />
              <Text style={styles.scannerZoomText}>
                {Math.round(scannerZoom * 100)}%
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeRenameDevice}
        transparent
        visible={renamingDevice !== null}
      >
        <View style={styles.renameBackdrop}>
          <View style={styles.renameSheet}>
            <View style={styles.renameHeader}>
              <View style={styles.renameIcon}>
                <Pencil size={18} color="#1b1008" />
              </View>
              <Text style={styles.renameTitle}>Rename Device</Text>
            </View>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={DEVICE_NAME_MAX_LENGTH}
              onChangeText={(value) => {
                setRenameDeviceName(value);
                setRenameDeviceError("");
              }}
              placeholder="Device name"
              placeholderTextColor="#756f68"
              selectTextOnFocus
              style={styles.renameInput}
              value={renameDeviceName}
            />
            {renameDeviceError ? (
              <Text style={styles.renameError}>{renameDeviceError}</Text>
            ) : null}
            <View style={styles.renameActions}>
              <Pressable
                style={[styles.renameButton, styles.renameCancelButton]}
                onPress={withHaptic(closeRenameDevice)}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.renameButton, styles.renameSaveButton]}
                onPress={withHaptic(saveRenamedDevice)}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ShortcutEditorModal
        editingShortcutId={editingShortcutId}
        formError={shortcutFormError}
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

function DevicePlatformIcon({
  platform,
  size,
}: {
  platform?: HostPlatform;
  size: number;
}) {
  if (platform === "win32") {
    return <WindowsIcon height={size} width={size} />;
  }

  if (platform === "darwin") {
    return <AppleIcon height={size} width={size} />;
  }

  return <Ionicons name="desktop-outline" size={size} color="#ffffff" />;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    color: "#a7a39d",
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 190,
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
  shortcuts: {
    flexShrink: 0,
    flexDirection: "row",
    gap: SHORTCUT_GAP,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  controlShortcutRow: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  remoteActionRow: {
    flexDirection: "row",
    flexShrink: 0,
    height: 48,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  shortcutGroup: {
    alignItems: "center",
    backgroundColor: "#11100e",
    borderColor: "#231c16",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 48,
    overflow: "hidden",
  },
  shortcutGroupPrimary: {
    backgroundColor: "#17130f",
    borderColor: "#3a2a1e",
  },
  shortcutDivider: {
    backgroundColor: "#231c16",
    height: 22,
    width: 1,
  },
  shortcutDividerPrimary: {
    backgroundColor: "#3a2a1e",
  },
  shortcutsScroller: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
  },
  scanButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
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
  desktopSwitchButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  homeDevicePicker: {
    alignSelf: "stretch",
    gap: 6,
    minWidth: 0,
    position: "relative",
    zIndex: 20,
  },
  homeDeviceButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.86)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  homeDeviceButtonPressed: {
    opacity: 0.82,
  },
  homeDeviceIcon: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  homeDeviceName: {
    color: "#f7f5f1",
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    minWidth: 0,
  },
  homeDeviceDropdown: {
    backgroundColor: "rgba(18, 17, 15, 0.98)",
    borderColor: "rgba(240, 169, 66, 0.2)",
    borderRadius: 14,
    borderWidth: 1,
    elevation: 18,
    shadowColor: "#4d250496",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.72,
    shadowRadius: 34,
    left: 0,
    position: "absolute",
    top: 60,
    zIndex: 30,
  },
  homeDeviceDropdownList: {
    backgroundColor: "rgba(18, 17, 15, 0.98)",
    borderRadius: 14,
    elevation: 12,
    maxHeight: 220,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.48,
    shadowRadius: 24,
    width: "100%",
  },
  homeDeviceOption: {
    alignItems: "center",
    alignSelf: "stretch",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
  },
  homeDeviceOptionSelected: {
    backgroundColor: "rgba(240, 169, 66, 0.09)",
  },
  homeDeviceOptionSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    minWidth: 0,
  },
  homeDeviceOptionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  homeDeviceOptionName: {
    color: "#f7f5f1",
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  homeDeviceOptionActions: {
    flexDirection: "row",
    gap: 6,
  },
  homeDeviceSelectedMark: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 22,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsContent: {
    gap: 12,
    paddingBottom: 28,
  },
  sensitivityCard: {
    alignItems: "stretch",
    backgroundColor: "#12110f",
    borderColor: "#2c2117",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: BODY_HORIZONTAL_PADDING,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsCardTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 10,
  },
  settingsCardIcon: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  dangerIcon: {
    backgroundColor: "#3a1717",
    borderColor: "#713131",
  },
  settingsStatusText: {
    color: "#8ff0b2",
    fontSize: 12,
    fontWeight: "900",
  },
  settingsStatusOffline: {
    color: "#a7a39d",
  },
  sensitivityLabel: {
    color: "#cec8be",
    fontSize: 14,
    fontWeight: "800",
  },
  settingHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingToggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  settingToggleCard: {
    justifyContent: "center",
  },
  settingSwitchWrap: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
  },
  settingHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  settingUnavailable: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "800",
  },
  sliderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  brightnessSliderWrap: {
    gap: 8,
  },
  brightnessSliderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  mediaControlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  mediaStepButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  volumeMuteButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  mediaLevelWrap: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  mediaValueRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mediaValueText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  mediaStepText: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "900",
  },
  mediaTickRow: {
    flexDirection: "row",
    gap: 3,
    height: 18,
  },
  mediaTick: {
    backgroundColor: "#33261b",
    borderRadius: 3,
    flex: 1,
  },
  volumeTickActive: {
    backgroundColor: "#ff941f",
  },
  hostTextBlock: {
    flex: 1,
    gap: 4,
  },
  hostValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  hostMeta: {
    color: "#9d968e",
    fontSize: 12,
    fontWeight: "700",
  },
  monitorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 48,
  },
  monitorIcon: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#33261b",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monitorIconTv: {
    backgroundColor: "#27301f",
    borderColor: "#50643a",
  },
  deviceDeleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(73, 24, 26, 0.84)",
    borderColor: "rgba(255, 87, 87, 0.3)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deviceEditButton: {
    alignItems: "center",
    backgroundColor: "rgba(42, 32, 20, 0.9)",
    borderColor: "rgba(240, 169, 66, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyDeviceText: {
    color: "#9d968e",
    fontSize: 13,
    fontWeight: "700",
    padding: 12,
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sensitivityControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 42,
  },
  sensitivityValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    minWidth: 48,
    textAlign: "center",
  },
  disabledControl: {
    opacity: 0.45,
  },
  disabledText: {
    color: "#756f68",
  },
  restartHostButton: {
    alignItems: "center",
    backgroundColor: "#8e2525",
    borderColor: "#c74343",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 12,
  },
  restartHostText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  restartHostMeta: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  renameBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  renameSheet: {
    backgroundColor: "#12110f",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%",
  },
  renameHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  renameIcon: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  renameTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  renameInput: {
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  renameError: {
    color: "#ff8a8a",
    fontSize: 12,
    fontWeight: "800",
  },
  renameActions: {
    flexDirection: "row",
    gap: 10,
  },
  renameButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  renameCancelButton: {
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderWidth: 1,
  },
  renameSaveButton: {
    backgroundColor: "#ff941f",
  },
  renameCancelText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  renameSaveText: {
    color: "#1b1008",
    fontSize: 14,
    fontWeight: "900",
  },
  keyboardPanel: {
    backgroundColor: "rgba(18, 17, 15, 0.94)",
    borderColor: "rgba(240, 169, 66, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    elevation: 18,
    left: BODY_HORIZONTAL_PADDING,
    padding: 14,
    position: "absolute",
    right: BODY_HORIZONTAL_PADDING,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.46,
    shadowRadius: 28,
    top: KEYBOARD_PANEL_TOP,
    zIndex: 1000,
  },
  keyboardPanelHidden: {
    opacity: 0,
  },
  keyboardPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  keyboardPanelTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  keyboardPanelIcon: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "rgba(240, 169, 66, 0.5)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 4,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#f0a942",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    width: 32,
  },
  keyboardPanelIconGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  keyboardPanelTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  keyboardPanelClose: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "rgba(255, 138, 114, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 4,
    height: 36,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    width: 36,
  },
  keyboardPanelCloseGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  keyboardPanelClosePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  keyboardPreview: {
    alignItems: "flex-start",
    backgroundColor: "rgba(12, 12, 12, 0.78)",
    borderColor: "rgba(255, 148, 31, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  keyboardPreviewEmpty: {
    color: "#5f5a54",
  },
  keyboardShortcutGrid: {
    flexDirection: "row",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 8,
  },
  keyboardShortcutButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(240, 169, 66, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  keyboardShortcutGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    gap: 5,
    justifyContent: "center",
    paddingHorizontal: 4,
    width: "100%",
  },
  keyboardShortcutButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  keyboardShortcutText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  trackpadWrap: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  mouseButtonRow: {
    flexShrink: 0,
    flexDirection: "row",
    gap: 8,
    height: 48,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  mouseButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    overflow: "hidden",
    paddingHorizontal: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },
  mouseButtonSide: {
    flex: 3,
    paddingHorizontal: 0,
  },
  keyboardMouseButton: {
    backgroundColor: "rgba(31, 25, 18, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.62)",
    flex: 4,
    paddingHorizontal: 0,
    shadowOpacity: 0.24,
  },
  keyboardMouseButtonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sideMouseButtonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  mouseButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  mouseButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  accentButtonText: {
    color: "#f0a942",
  },
  keyboardBg: {
    backgroundColor: "rgba(7, 7, 7, 0.82)",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    width: "100%",
    zIndex: 999,
  },
  keyboardBgPressable: {
    flex: 1,
  },
  scannerBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.86)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  scannerSheet: {
    alignItems: "stretch",
    backgroundColor: "#14110f",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 520,
    padding: 14,
    width: "100%",
  },
  scannerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scannerTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  scannerIcon: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  scannerTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },
  scannerCloseButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  scannerCameraFrame: {
    alignSelf: "center",
    backgroundColor: "#070707",
    borderColor: "#33261b",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  scannerCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerGuide: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  scannerCorner: {
    borderColor: "#ff941f",
    height: 42,
    position: "absolute",
    width: 42,
  },
  scannerCornerTopLeft: {
    borderLeftWidth: 4,
    borderTopWidth: 4,
    left: "24%",
    top: "24%",
  },
  scannerCornerTopRight: {
    borderRightWidth: 4,
    borderTopWidth: 4,
    right: "24%",
    top: "24%",
  },
  scannerCornerBottomLeft: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    bottom: "24%",
    left: "24%",
  },
  scannerCornerBottomRight: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
    bottom: "24%",
    right: "24%",
  },
  scannerZoomRow: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  scannerZoomSlider: {
    flex: 1,
    height: 36,
  },
  scannerZoomText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    minWidth: 38,
    textAlign: "right",
  },
});
