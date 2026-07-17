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
  Easing,
  Keyboard,
  Modal,
  type NativeSyntheticEvent,
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
  Undo2,
  Redo2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "../../components/Header";
import { ShortcutButton } from "../../components/ShortcutButton";
import { Trackpad } from "../trackpad/Trackpad";
import type {
  ShortcutId,
  TextCommand,
} from "../../types/protocol";
import { RemoteSocket } from "../../websocket/RemoteSocket";
import { withHaptic } from "../../utils/haptics";
import DisneyPlusIcon from "../../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../../assets/shortcuts/netflix.svg";
import PrimeIcon from "../../assets/shortcuts/prime.svg";
import SpotifyIcon from "../../assets/shortcuts/spotify.svg";
import { sanitizeHostName } from "../connection/deviceUtils";
import { parsePairingPayload } from "../connection/pairing";
import { useRemoteConnection } from "../connection/useRemoteConnection";
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

export function RemoteControlMaster() {
  const socket = useMemo(() => new RemoteSocket(), []);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const keyboardInputRef = useRef<TextInput>(null);
  const keyboardActiveRef = useRef(false);
  const bufferRef = useRef("");
  const keyboardSelectionRef = useRef({ start: 0, end: 0 });
  const remoteKeyboardCursorRef = useRef(0);
  const remoteKeyboardSelectionActiveRef = useRef(false);
  const scannerOpenRef = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerZoom, setScannerZoom] = useState(0.2);
  const {
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling,
  } = useRemoteSettings();
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
    connectToHost,
    deleteSavedDevice,
    deviceDropdownOpen,
    host,
    hostName,
    latencyMs,
    persistHostName,
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
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const [keyboardBuffer, setKeyboardBuffer] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOverlay, setKeyboardOverlay] = useState(false);
  const [keyboardUiMounted, setKeyboardUiMounted] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [keyboardSelection, setKeyboardSelection] = useState({
    start: 0,
    end: 0,
  });
  const [keyboardInputKey, setKeyboardInputKey] = useState(0);
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

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        applyHostProfile(message);
        applyHostState(message);

        const nextHostName = sanitizeHostName(message.hostName);

        if (nextHostName) {
          persistHostName(nextHostName);
        }
      }
    });

    return unsubscribe;
  }, [applyHostProfile, applyHostState, persistHostName, socket]);

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
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

  function toggleSettings() {
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
    setScannerVisible(true);
  }

  function closeScanner() {
    scannerOpenRef.current = false;
    setScannerVisible(false);
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

    connectToHost(pairing.url, pairing.hostName);
  }

  function focusKeyboard() {
    keyboardActiveRef.current = true;
    clearKeyboardInput();
    setKeyboardOverlay(true);

    refocusKeyboardInput();
  }

  function refocusKeyboardInput() {
    requestAnimationFrame(() => {
      keyboardInputRef.current?.focus();
    });

    setTimeout(() => {
      keyboardInputRef.current?.focus();
    }, 60);
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
    const selectionStart = Math.max(0, Math.min(selection.start, selection.end));
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

      for (
        let index = 0;
        index < selectionEnd - selectionStart;
        index += 1
      ) {
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
  const monitorName = hostDisplay?.name ?? "Unknown monitor";
  const monitorMeta = hostDisplay
    ? hostDisplay.isTv
      ? "TV detected"
      : "Display detected"
    : "Connect to host for display details";
  const {
    overviewAvailable,
    overviewLabel,
    sleepAvailable,
    switchWindowAvailable,
    switchWorkspaceAvailable,
  } = controlsAvailability;
  const primarySwitchAvailable =
    hostPlatform === "win32" ? switchWindowAvailable : switchWorkspaceAvailable;
  const showConnectionPrompt = status !== "connected";
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

  return (
    <SafeAreaView style={styles.screen}>
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

      <Header
        latencyMs={latencyMs}
        status={status}
        title={hostName || "Remote Control"}
        onToggleSettings={toggleSettings}
        onSleep={sleepAvailable ? sendSleep : undefined}
      />

      <Animated.View
        style={[
          styles.keyboardPanel,
          keyboardUiMounted ? null : styles.keyboardPanelHidden,
          keyboardPanelAnimatedStyle,
        ]}
        pointerEvents={keyboardUiMounted ? "auto" : "none"}
      >
        <View style={styles.keyboardPanelHeader}>
          <View style={styles.keyboardPanelTitleRow}>
            <View style={styles.keyboardPanelIcon}>
              <Ionicons name="keypad-outline" size={18} color="#ffffff" />
            </View>
            <Text style={styles.keyboardPanelTitle}>Keyboard</Text>
          </View>
          <Pressable
            style={styles.keyboardPanelClose}
            onPress={withHaptic(dismissKeyboardInput)}
          >
            <Ionicons name="close" size={20} color="#ec3434" />
          </Pressable>
        </View>

        <TextInput
          key={keyboardInputKey}
          ref={keyboardInputRef}
          value={keyboardBuffer}
          onChangeText={handleKeyboardTextChange}
          onKeyPress={handleKeyboardKeyPress}
          onSelectionChange={handleKeyboardSelectionChange}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          multiline
          blurOnSubmit={false}
          keyboardAppearance="dark"
          selection={keyboardSelection}
          selectionColor="#ff941f"
          style={[
            styles.keyboardPreview,
            typedText ? null : styles.keyboardPreviewEmpty,
          ]}
        />

        <View style={styles.keyboardShortcutGrid}>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(() => sendKeyboardShortcut("selectAll"))}
          >
            <Ionicons name="scan-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Select All</Text>
          </Pressable>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(insertKeyboardNewLine)}
          >
            <Ionicons
              name="return-down-forward-outline"
              size={18}
              color="#ffffff"
            />
            <Text style={styles.keyboardShortcutText}>New Line</Text>
          </Pressable>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(() => sendKeyboardShortcut("copy"))}
          >
            <Ionicons name="copy-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Copy</Text>
          </Pressable>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(() => sendKeyboardShortcut("paste"))}
          >
            <Ionicons name="clipboard-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Paste</Text>
          </Pressable>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(pasteFromPhoneClipboard)}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={18}
              color="#ffffff"
            />
            <Text style={styles.keyboardShortcutText}>Paste Phone</Text>
          </Pressable>
          <Pressable
            style={[styles.keyboardShortcutButton, keyboardShortcutButtonStyle]}
            onPress={withHaptic(() => sendKeyboardShortcut("clear"))}
          >
            <Ionicons name="backspace-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Clear</Text>
          </Pressable>
        </View>
      </Animated.View>

      <SettingsBottomSheet
        isOpen={showSettings}
        onOpenChange={setShowSettings}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.settingsScroll}
          contentContainerStyle={styles.settingsContent}
        >
          <View style={styles.sensitivityCard}>
            <View style={styles.settingsCardHeader}>
              <View style={styles.settingsCardTitleRow}>
                <View style={styles.settingsCardIcon}>
                  <Ionicons name="desktop-outline" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Connected Device</Text>
              </View>
              <Text
                style={[
                  styles.settingsStatusText,
                  status !== "connected" ? styles.settingsStatusOffline : null,
                ]}
              >
                {status === "connected" ? "Online" : "Offline"}
              </Text>
            </View>
            <View style={styles.hostRow}>
              <Pressable
                style={styles.deviceSelectButton}
                onPress={withHaptic(() =>
                  setDeviceDropdownOpen((open) => !open),
                )}
              >
                <View style={styles.hostTextBlock}>
                  <Text style={styles.hostValue}>
                    {hostName || host || "No device saved"}
                  </Text>
                  {hostName && host ? (
                    <Text style={styles.hostMeta}>{host}</Text>
                  ) : null}
                </View>
                <Ionicons
                  name={deviceDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#ffffff"
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Scan desktop QR"
                style={({ pressed }) => [
                  styles.connectButton,
                  pressed ? styles.scanButtonPressed : null,
                ]}
                onPress={withHaptic(openScanner)}
              >
                <ScanButtonGradient
                  colors={["#f4b760", "#e2943b", "#c8762f"]}
                  end={{ x: 0.85, y: 1 }}
                  start={{ x: 0.15, y: 0 }}
                  style={styles.connectButtonGradient}
                >
                  <Ionicons name="qr-code-outline" size={20} color="#1b1008" />
                </ScanButtonGradient>
              </Pressable>
            </View>
            {deviceDropdownOpen ? (
              <View style={styles.deviceDropdown}>
                {savedDevices.length > 0 ? (
                  <ScrollView style={styles.deviceDropdownList}>
                    {savedDevices.map((device) => {
                      const selected = device.host === host;

                      return (
                        <View
                          key={device.id}
                          style={[
                            styles.deviceOption,
                            selected && styles.deviceOptionSelected,
                          ]}
                        >
                          <Pressable
                            style={styles.deviceOptionSelect}
                            onPress={withHaptic(() => selectSavedDevice(device))}
                          >
                            <View style={styles.hostTextBlock}>
                              <Text style={styles.deviceOptionName}>
                                {device.name}
                              </Text>
                              <Text style={styles.deviceOptionHost}>
                                {device.host}
                              </Text>
                            </View>
                            {selected ? (
                              <Ionicons
                                name="checkmark"
                                size={20}
                                color="#74f0a7"
                              />
                            ) : null}
                          </Pressable>
                          <Pressable
                            accessibilityLabel={`Delete ${device.name}`}
                            style={styles.deviceDeleteButton}
                            onPress={withHaptic(() => deleteSavedDevice(device))}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={19}
                              color="#ff8a8a"
                            />
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyDeviceText}>
                    Scan a desktop QR code to save it here.
                  </Text>
                )}
              </View>
            ) : null}
          </View>

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
                  hostDisplay?.isTv ? styles.monitorIconTv : null,
                ]}
              >
                <Ionicons
                  name={hostDisplay?.isTv ? "tv-outline" : "desktop-outline"}
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
                  <Ionicons name="speedometer-outline" size={18} color="#ffffff" />
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
                <Text style={styles.sensitivityLabel}>
                  Unnatural scrolling
                </Text>
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
              {hostDisplay?.brightnessAdjustable === false ? (
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
                  <Ionicons name="volume-high-outline" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Volume</Text>
              </View>
              <View style={styles.settingHeaderActions}>
                {hostDisplay?.volumeAdjustable === false ? (
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
              <Ionicons name="reload-circle-outline" size={22} color="#ffffff" />
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
            <Pressable
              accessibilityLabel="Scan to connect to host"
              accessibilityRole="button"
              onPress={withHaptic(openScanner)}
              style={styles.connectionPromptButton}
            >
              <ScanButtonGradient
                colors={["#f4b760", "#e2943b", "#c8762f"]}
                end={{ x: 0.85, y: 1 }}
                start={{ x: 0.15, y: 0 }}
                style={styles.connectionPromptButtonGradient}
              >
                <Ionicons name="scan-outline" size={22} color="#1b1008" />
                <Text style={styles.connectionPromptButtonText}>
                  Scan to Connect
                </Text>
              </ScanButtonGradient>
            </Pressable>
          </View>
        ) : (
          <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.shortcutsScroller}
          contentContainerStyle={styles.shortcuts}
        >
          <ShortcutButton
            SvgIcon={NetflixIcon}
            label="Netflix"
            onPress={() => sendShortcut("netflix")}
          />
          <ShortcutButton
            icon="logo-youtube"
            iconColor="#ff0033"
            label="YouTube"
            onPress={() => sendShortcut("youtube")}
          />
          <ShortcutButton
            SvgIcon={DisneyPlusIcon}
            label="Disney+"
            onPress={() => sendShortcut("disney")}
          />
          <ShortcutButton
            SvgIcon={PrimeIcon}
            label="Amazon Prime"
            onPress={() => sendShortcut("amazon")}
          />
          <ShortcutButton
            SvgIcon={SpotifyIcon}
            label="Spotify"
            onPress={() => sendShortcut("spotify")}
          />
          {customShortcuts.map((shortcut) => (
            <ShortcutButton
              key={shortcut.id}
              imageUri={shortcut.iconUri}
              initial={shortcut.name}
              label={shortcut.name}
              onPress={() => sendCustomShortcut(shortcut)}
              onLongPress={() => openEditShortcutModal(shortcut)}
            />
          ))}
          <ShortcutButton
            icon="add"
            iconColor="#ff941f"
            label="Add Shortcut"
            onPress={openShortcutModal}
          />
        </ScrollView>

        <View style={styles.shortcuts}>
          <View style={styles.shortcutGroup}>
            <Pressable
              disabled={!primarySwitchAvailable}
              style={[
                styles.desktopSwitchButton,
                !primarySwitchAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel={
                hostPlatform === "win32"
                  ? "Previous window"
                  : "Previous desktop"
              }
              onPress={withHaptic(() => switchPrimaryHorizontal("left"))}
            >
              <PanelRightOpenIcon size={24} color="#b8afa5" />
            </Pressable>
            <View style={styles.shortcutDivider} />
            <Pressable
              disabled={!primarySwitchAvailable}
              style={[
                styles.desktopSwitchButton,
                !primarySwitchAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel={
                hostPlatform === "win32" ? "Next window" : "Next desktop"
              }
              onPress={withHaptic(() => switchPrimaryHorizontal("right"))}
            >
              <PanelRightCloseIcon size={24} color="#b8afa5" />
            </Pressable>
          </View>

          <View style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}>
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Previous browser page"
              onPress={withHaptic(() => socket.sendTextCommand("browserBack"))}
            >
              <Undo2 size={24} color="#f0c17c" />
            </Pressable>
            <View
              style={[styles.shortcutDivider, styles.shortcutDividerPrimary]}
            />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Next browser page"
              onPress={withHaptic(() =>
                socket.sendTextCommand("browserForward"),
              )}
            >
              <Redo2 size={24} color="#f0c17c" />
            </Pressable>
          </View>

          <View style={styles.shortcutGroup}>
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Left arrow key"
              onPress={withHaptic(() => socket.sendKey("leftArrow"))}
            >
              <ClockArrowLeftIcon size={24} color="#9e9890" />
            </Pressable>
            <View style={styles.shortcutDivider} />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Right arrow key"
              onPress={withHaptic(() => socket.sendKey("rightArrow"))}
            >
              <ClockArrowRightIcon size={24} color="#9e9890" />
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
          />
        </View>

        <View style={styles.remoteActionRow}>
          <View style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}>
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Escape key"
              onPress={withHaptic(() => socket.sendKey("escape"))}
            >
              <Minimize2Icon size={24} color="#f0c17c" />
            </Pressable>
            <View
              style={[styles.shortcutDivider, styles.shortcutDividerPrimary]}
            />
            <Pressable
              disabled={!switchWindowAvailable}
              style={[
                styles.desktopSwitchButton,
                !switchWindowAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel="Switch window"
              onPress={withHaptic(() => remoteActions.switchWindow("next"))}
            >
              <Ionicons name="albums-outline" size={24} color="#f0c17c" />
            </Pressable>
            <View
              style={[styles.shortcutDivider, styles.shortcutDividerPrimary]}
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
              <LayoutPanelTopIcon size={24} color="#f0c17c" />
            </Pressable>
            <View
              style={[styles.shortcutDivider, styles.shortcutDividerPrimary]}
            />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel={
                playbackPaused ? "Play media" : "Pause media"
              }
              onPress={withHaptic(toggleRemotePlayback)}
            >
              <PlaybackIcon size={24} color="#f0c17c" />
            </Pressable>
            <View
              style={[styles.shortcutDivider, styles.shortcutDividerPrimary]}
            />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Close current browser tab"
              onPress={withHaptic(() => socket.sendTextCommand("closeTab"))}
            >
              <SquareXIcon size={24} color="#f0c17c" />
            </Pressable>
          </View>
        </View>

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
              colors={["#f4b760", "#e2943b", "#c8762f"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.keyboardMouseButtonGradient}
            >
              <KeyboardIcon size={23} color="#1b1008" />
              <Text style={[styles.mouseButtonText, styles.accentButtonText]}>
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
                  style={[
                    styles.scannerCorner,
                    styles.scannerCornerBottomLeft,
                  ]}
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
  remoteControls: {
    flex: 1,
    gap: 12,
    minHeight: 0,
    position: "relative",
  },
  shortcuts: {
    flexShrink: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
  },
  remoteActionRow: {
    flexDirection: "row",
    flexShrink: 0,
    height: 56,
    paddingHorizontal: 18,
  },
  shortcutGroup: {
    alignItems: "center",
    backgroundColor: "#11100e",
    borderColor: "#231c16",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 56,
    overflow: "hidden",
  },
  shortcutGroupPrimary: {
    backgroundColor: "#17130f",
    borderColor: "#3a2a1e",
  },
  shortcutDivider: {
    backgroundColor: "#231c16",
    height: 26,
    width: 1,
  },
  shortcutDividerPrimary: {
    backgroundColor: "#3a2a1e",
  },
  shortcutsScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 70,
    width: "100%",
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#c8762f",
    borderColor: "#ffbf66",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    justifyContent: "center",
    minHeight: 52,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    width: 52,
  },
  connectButtonGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
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
    paddingHorizontal: 18,
  },
  connectionPromptButton: {
    backgroundColor: "#c8762f",
    borderColor: "#ffbf66",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  connectionPromptButtonGradient: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 58,
    overflow: "hidden",
    paddingHorizontal: 22,
  },
  connectionPromptButtonText: {
    color: "#1b1008",
    fontSize: 15,
    fontWeight: "900",
  },
  desktopSwitchButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    flex: 1,
    justifyContent: "center",
    minHeight: 54,
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
    marginHorizontal: 18,
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
  hostRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  hostTextBlock: {
    flex: 1,
    gap: 4,
  },
  deviceSelectButton: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  deviceDropdown: {
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  deviceDropdownList: {
    maxHeight: 220,
  },
  deviceOption: {
    alignItems: "center",
    borderBottomColor: "#1c1712",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  deviceOptionSelected: {
    backgroundColor: "#2c1b10",
  },
  deviceOptionSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  deviceDeleteButton: {
    alignItems: "center",
    backgroundColor: "#32191d",
    borderColor: "#5b2730",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deviceOptionName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  deviceOptionHost: {
    color: "#9d968e",
    fontSize: 12,
    fontWeight: "700",
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
  keyboardPanel: {
    backgroundColor: "rgba(18, 17, 15, 0.9)",
    borderColor: "rgba(255, 148, 31, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 356,
    gap: 14,
    left: 18,
    padding: 14,
    position: "absolute",
    right: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    top: 106,
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
    backgroundColor: "#ff941f",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  keyboardPanelTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  keyboardPanelClose: {
    alignItems: "center",
    backgroundColor: "#3d2020",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
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
    backgroundColor: "#211811",
    borderColor: "#34261a",
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 4,
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
    paddingHorizontal: 18,
  },
  mouseButtonRow: {
    flexShrink: 0,
    flexDirection: "row",
    gap: 12,
    height: 52,
    paddingHorizontal: 18,
  },
  mouseButton: {
    alignItems: "center",
    backgroundColor: "#15120f",
    borderColor: "#4a3124",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
    overflow: "hidden",
    paddingHorizontal: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  mouseButtonSide: {
    flex: 3,
    paddingHorizontal: 0,
  },
  keyboardMouseButton: {
    backgroundColor: "#c8762f",
    borderColor: "#eba84e",
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
    color: "#1b1008",
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
