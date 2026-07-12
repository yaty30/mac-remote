import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import {
  CameraView,
  type ScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  type AppStateStatus,
  Animated,
  Easing,
  Image,
  Keyboard,
  Modal,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "../components/Header";
import { ShortcutButton } from "../components/ShortcutButton";
import { Trackpad } from "../components/Trackpad";
import type {
  ConnectionStatus,
  HostDisplayInfo,
  ShortcutId,
  TextCommand,
} from "../types/protocol";
import { RemoteSocket } from "../websocket/RemoteSocket";
import { withHaptic } from "../utils/haptics";
import DisneyPlusIcon from "../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../assets/shortcuts/netflix.svg";
import PrimeIcon from "../assets/shortcuts/prime.svg";
import SpotifyIcon from "../assets/shortcuts/spotify.svg";

const HOST_STORAGE_KEY = "remote-control:last-host";
const HOST_NAME_STORAGE_KEY = "remote-control:last-host-name";
const DEVICES_STORAGE_KEY = "remote-control:devices";
const SENSITIVITY_STORAGE_KEY = "remote-control:sensitivity";
const CUSTOM_SHORTCUTS_STORAGE_KEY = "remote-control:custom-shortcuts";
const MEDIA_CONTROL_STEPS = 16;
const HOST_STATE_POLL_MS = 1500;
const DEFAULT_SENSITIVITY = 2.3;

interface CustomShortcut {
  id: string;
  name: string;
  url: string;
  iconUri?: string;
}

interface PairingPayload {
  url: string;
  hostName?: string;
}

interface SavedDevice {
  id: string;
  name: string;
  host: string;
  lastConnectedAt: number;
}

export function RemoteScreen() {
  const socket = useMemo(() => new RemoteSocket(), []);
  const keyboardInputRef = useRef<TextInput>(null);
  const keyboardActiveRef = useRef(false);
  const bufferRef = useRef("");
  const scannerOpenRef = useRef(false);
  const hostRef = useRef("");
  const statusRef = useRef<ConnectionStatus>("idle");

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerZoom, setScannerZoom] = useState(0.2);
  const [host, setHost] = useState("");
  const [hostName, setHostName] = useState("");
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [hostDisplay, setHostDisplay] = useState<HostDisplayInfo | null>(null);
  const [keyboardBuffer, setKeyboardBuffer] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOverlay, setKeyboardOverlay] = useState(false);
  const [keyboardUiMounted, setKeyboardUiMounted] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [keyboardInputKey, setKeyboardInputKey] = useState(0);
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>([]);
  const [shortcutModalVisible, setShortcutModalVisible] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(
    null,
  );
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutWebsite, setShortcutWebsite] = useState("");
  const [shortcutIconUri, setShortcutIconUri] = useState<string | undefined>();
  const [shortcutFormError, setShortcutFormError] = useState("");
  const keyboardPanelAnim = useRef(new Animated.Value(0)).current;
  const settingsAnim = useRef(new Animated.Value(showSettings ? 1 : 0)).current;

  useEffect(() => {
    const unsubscribe = socket.onStatus((nextStatus) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
    });

    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        if (message.display) {
          setHostDisplay(message.display);
        }

        if (typeof message.brightness === "number") {
          setBrightness(clampPercent(message.brightness));
        }

        if (typeof message.volume === "number") {
          setVolume(clampPercent(message.volume));
        }

        const nextHostName = sanitizeHostName(message.hostName);

        if (nextHostName) {
          persistHostName(nextHostName, hostRef.current);
        }
      }
    });

    return unsubscribe;
  }, [socket]);

  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    socket.requestHostState();
    const interval = setInterval(() => {
      socket.requestHostState();
    }, HOST_STATE_POLL_MS);

    return () => clearInterval(interval);
  }, [socket, status]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active" && statusRef.current === "connected") {
          socket.requestHostState();
          return;
        }

        if (
          nextState === "active" &&
          hostRef.current.trim().length > 0 &&
          statusRef.current !== "connected" &&
          statusRef.current !== "connecting"
        ) {
          socket.connect(hostRef.current);
        }
      },
    );

    return () => subscription.remove();
  }, [socket]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(SENSITIVITY_STORAGE_KEY)
      .then((saved) => {
        if (cancelled || !saved) {
          return;
        }

        const parsed = Number.parseFloat(saved);
        if (Number.isFinite(parsed)) {
          setSensitivity(Math.max(0.25, Math.min(3, parsed)));
        }
      })
      .catch(() => {
        // ignore storage errors
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(HOST_STORAGE_KEY),
      AsyncStorage.getItem(HOST_NAME_STORAGE_KEY),
      AsyncStorage.getItem(DEVICES_STORAGE_KEY),
    ])
      .then(([savedHost, savedHostName, savedDevicesRaw]) => {
        if (cancelled) {
          return;
        }

        const devices = parseSavedDevices(savedDevicesRaw);
        const legacyHost = savedHost?.trim();
        const legacyName = sanitizeHostName(savedHostName);
        const nextDevices =
          legacyHost && !devices.some((device) => device.host === legacyHost)
            ? upsertDevice(devices, {
                id: getDeviceId(legacyHost),
                name: legacyName ?? getDeviceNameFromHost(legacyHost),
                host: legacyHost,
                lastConnectedAt: Date.now(),
              })
            : devices;

        setSavedDevices(nextDevices);

        if (legacyHost && nextDevices.length !== devices.length) {
          persistSavedDevices(nextDevices);
        }

        if (legacyHost) {
          const device = nextDevices.find((item) => item.host === legacyHost);

          hostRef.current = legacyHost;
          setHost(legacyHost);
          setHostName(device?.name ?? legacyName ?? "");
          socket.connect(legacyHost);
        }
      })
      .catch(() => {
        // ignore storage errors
      });

    return () => {
      cancelled = true;
    };
  }, [socket]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(CUSTOM_SHORTCUTS_STORAGE_KEY)
      .then((saved) => {
        if (cancelled || !saved) {
          return;
        }

        setCustomShortcuts(parseCustomShortcuts(saved));
      })
      .catch(() => {
        // ignore storage errors
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "connected" && host.trim().length > 0) {
      AsyncStorage.setItem(HOST_STORAGE_KEY, host.trim()).catch(() => {
        // ignore storage errors
      });
    }
  }, [status, host]);

  useEffect(() => {
    AsyncStorage.setItem(SENSITIVITY_STORAGE_KEY, String(sensitivity)).catch(
      () => {
        // ignore storage errors
      },
    );
  }, [sensitivity]);

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

  useEffect(() => {
    if (showSettings) {
      Animated.timing(settingsAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [settingsAnim, showSettings]);

  function toggleSettings() {
    setShowSettings((visible) => {
      const nextVisible = !visible;

      if (nextVisible) {
        settingsAnim.stopAnimation();
        settingsAnim.setValue(0);
      }

      return nextVisible;
    });
  }

  function clearKeyboardInput() {
    keyboardInputRef.current?.setNativeProps({ text: "" });
    bufferRef.current = "";
    setKeyboardBuffer("");
    setTypedText("");
    setKeyboardInputKey((current) => current + 1);
  }

  function clearKeyboardTextArea() {
    keyboardInputRef.current?.setNativeProps({ text: "" });
    bufferRef.current = "";
    setKeyboardBuffer("");
    setTypedText("");
  }

  function dismissKeyboardInput() {
    keyboardActiveRef.current = false;
    Keyboard.dismiss();
    setKeyboardOverlay(false);
    clearKeyboardInput();
  }

  function persistHostName(nextHostName: string, deviceHost = host) {
    setHostName(nextHostName);
    AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, nextHostName).catch(() => {
      // ignore storage errors
    });

    if (deviceHost.trim()) {
      persistDevice({
        host: deviceHost,
        name: nextHostName,
      });
    }
  }

  function connectToHost(nextHost: string, nextHostName?: string) {
    const cleanHost = nextHost.trim();

    if (cleanHost.length === 0) {
      setStatus("error");
      return;
    }

    Keyboard.dismiss();
    setDeviceDropdownOpen(false);
    hostRef.current = cleanHost;
    setHost(cleanHost);
    setBrightness(null);
    setVolume(null);
    setHostDisplay(null);
    const matchingDevice = savedDevices.find(
      (device) => device.host === cleanHost,
    );
    const displayName =
      nextHostName ?? matchingDevice?.name ?? getDeviceNameFromHost(cleanHost);

    if (displayName) {
      setHostName(displayName);
      AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, displayName).catch(() => {
        // ignore storage errors
      });
    }
    AsyncStorage.setItem(HOST_STORAGE_KEY, cleanHost).catch(() => {
      // ignore storage errors
    });
    persistDevice({
      host: cleanHost,
      name: displayName,
    });
    socket.connect(cleanHost);
  }

  function persistDevice(input: { host: string; name?: string }) {
    const cleanHost = input.host.trim();

    if (!cleanHost) {
      return;
    }

    const nextDevice: SavedDevice = {
      id: getDeviceId(cleanHost),
      name: input.name?.trim() || getDeviceNameFromHost(cleanHost),
      host: cleanHost,
      lastConnectedAt: Date.now(),
    };

    setSavedDevices((currentDevices) => {
      const nextDevices = upsertDevice(currentDevices, nextDevice);
      persistSavedDevices(nextDevices);
      return nextDevices;
    });
  }

  function selectSavedDevice(device: SavedDevice) {
    connectToHost(device.host, device.name);
  }

  function deleteSavedDevice(device: SavedDevice) {
    setSavedDevices((currentDevices) => {
      const nextDevices = currentDevices.filter((item) => item.id !== device.id);
      persistSavedDevices(nextDevices);
      return nextDevices;
    });

    if (device.host !== hostRef.current) {
      return;
    }

    socket.disconnect();
    statusRef.current = "idle";
    hostRef.current = "";
    setStatus("idle");
    setHost("");
    setHostName("");
    setBrightness(null);
    setVolume(null);
    setHostDisplay(null);
    setDeviceDropdownOpen(false);
    AsyncStorage.multiRemove([HOST_STORAGE_KEY, HOST_NAME_STORAGE_KEY]).catch(
      () => {
        // ignore storage errors
      },
    );
  }

  function sendShortcut(shortcut: ShortcutId) {
    socket.sendShortcut(shortcut);
  }

  function sendCustomShortcut(shortcut: CustomShortcut) {
    socket.sendWebsiteShortcut(shortcut.name, shortcut.url);
  }

  function openShortcutModal() {
    setEditingShortcutId(null);
    setShortcutName("");
    setShortcutWebsite("");
    setShortcutIconUri(undefined);
    setShortcutFormError("");
    setShortcutModalVisible(true);
  }

  function openEditShortcutModal(shortcut: CustomShortcut) {
    setEditingShortcutId(shortcut.id);
    setShortcutName(shortcut.name);
    setShortcutWebsite(shortcut.url);
    setShortcutIconUri(shortcut.iconUri);
    setShortcutFormError("");
    setShortcutModalVisible(true);
  }

  function closeShortcutModal() {
    setShortcutModalVisible(false);
    setEditingShortcutId(null);
    setShortcutFormError("");
  }

  async function pickShortcutIcon() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setShortcutFormError(
        "Photo library permission is required to upload an icon.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setShortcutIconUri(result.assets[0].uri);
      setShortcutFormError("");
    }
  }

  function saveCustomShortcut() {
    const name = shortcutName.trim();
    const url = normalizeWebsiteUrl(shortcutWebsite);

    if (!name) {
      setShortcutFormError("Enter a shortcut name.");
      return;
    }

    if (!url) {
      setShortcutFormError("Enter a valid website.");
      return;
    }

    const nextShortcut = {
      id: editingShortcutId ?? `${Date.now()}`,
      name: name.slice(0, 40),
      url,
      iconUri: shortcutIconUri,
    };
    const nextShortcuts = editingShortcutId
      ? customShortcuts.map((shortcut) =>
          shortcut.id === editingShortcutId ? nextShortcut : shortcut,
        )
      : [...customShortcuts, nextShortcut];

    persistCustomShortcuts(nextShortcuts);
    closeShortcutModal();
  }

  function deleteCustomShortcut() {
    if (!editingShortcutId) {
      return;
    }

    persistCustomShortcuts(
      customShortcuts.filter((shortcut) => shortcut.id !== editingShortcutId),
    );
    closeShortcutModal();
  }

  function persistCustomShortcuts(nextShortcuts: CustomShortcut[]) {
    setCustomShortcuts(nextShortcuts);
    AsyncStorage.setItem(
      CUSTOM_SHORTCUTS_STORAGE_KEY,
      JSON.stringify(nextShortcuts),
    ).catch(() => {
      // ignore storage errors
    });
  }

  function sendSleep() {
    socket.sendSleep();
  }

  function confirmRestartHost() {
    if (status !== "connected") {
      return;
    }

    Alert.alert(
      "Restart host Mac?",
      `This will force restart ${hostName || "the connected Mac"} now. Unsaved documents and terminal sessions may be closed without another prompt.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Restart",
          style: "destructive",
          onPress: () => socket.sendRestartHost(),
        },
      ],
    );
  }

  function adjustSensitivity(delta: number) {
    setSensitivity((current) => {
      const next = Math.max(0.25, Math.min(3, current + delta));
      return Math.round(next * 100) / 100;
    });
  }

  async function openScanner() {
    const permission =
      cameraPermission?.granted === true
        ? cameraPermission
        : await requestCameraPermission();

    if (!permission.granted) {
      setStatus("error");
      return;
    }

    scannerOpenRef.current = true;
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
      setStatus("error");
      return;
    }

    connectToHost(pairing.url, pairing.hostName);
  }

  function adjustBrightnessStep(delta: -1 | 1) {
    if (hostDisplay?.brightnessAdjustable !== true) {
      return;
    }

    const currentStep = percentToStep(brightness);

    socket.sendBrightness(delta);

    if (currentStep !== null) {
      setBrightness(stepToPercent(currentStep + delta));
    }
  }

  function adjustVolumeStep(delta: -1 | 1) {
    if (hostDisplay?.volumeAdjustable !== true) {
      return;
    }

    const currentStep = percentToStep(volume);

    if (currentStep === null) {
      socket.requestHostState();
      return;
    }

    const next = stepToPercent(currentStep + delta);
    setVolume(next);
    socket.sendVolume(next);
  }

  function focusKeyboard() {
    keyboardActiveRef.current = true;
    clearKeyboardInput();
    setKeyboardOverlay(true);

    requestAnimationFrame(() => {
      keyboardInputRef.current?.focus();
    });
  }

  function sendTextChunk(text: string) {
    const pieces = text.split("\n");

    pieces.forEach((piece, index) => {
      if (piece.length > 0) {
        socket.sendText(piece);
      }

      if (index < pieces.length - 1) {
        socket.sendKey("enter");
      }
    });
  }

  function handleKeyboardTextChange(nextText: string) {
    if (!keyboardActiveRef.current) {
      return;
    }

    const prev = bufferRef.current;

    if (nextText === prev) {
      return;
    }

    if (nextText.startsWith(prev)) {
      sendTextChunk(nextText.slice(prev.length));
    } else if (prev.startsWith(nextText)) {
      const backspaceCount = prev.length - nextText.length;
      for (let index = 0; index < backspaceCount; index += 1) {
        socket.sendKey("backspace");
      }
    } else {
      for (let index = 0; index < prev.length; index += 1) {
        socket.sendKey("backspace");
      }
      sendTextChunk(nextText);
    }

    if (nextText.includes("\n")) {
      clearKeyboardTextArea();
      return;
    }

    const nextBuffer = nextText.length > 80 ? "" : nextText;
    bufferRef.current = nextBuffer;
    setKeyboardBuffer(nextBuffer);
    setTypedText(nextText);
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

    if (command === "clear") {
      clearKeyboardTextArea();
    }

    requestAnimationFrame(() => {
      keyboardInputRef.current?.focus();
    });
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
  const settingsAnimatedStyle = {
    opacity: settingsAnim,
    transform: [
      {
        translateY: settingsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
  const brightnessAdjustable = hostDisplay?.brightnessAdjustable === true;
  const volumeAdjustable = hostDisplay?.volumeAdjustable === true;
  const brightnessStep = percentToStep(brightness);
  const volumeStep = percentToStep(volume);
  const monitorName = hostDisplay?.name ?? "Unknown monitor";
  const monitorMeta = hostDisplay
    ? hostDisplay.isTv
      ? "TV detected"
      : "Display detected"
    : "Connect to host for display details";

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
        status={status}
        title={hostName || "iMac Remote"}
        onScan={openScanner}
        showSettings={showSettings}
        onToggleSettings={toggleSettings}
        onSleep={sendSleep}
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

        <View style={styles.keyboardPreview}>
          <Text
            numberOfLines={5}
            style={[
              styles.keyboardPreviewText,
              typedText ? null : styles.keyboardPreviewTextEmpty,
            ]}
          >
            {typedText || " "}
          </Text>
          <View style={styles.keyboardPreviewCursor} />
        </View>

        <View style={styles.keyboardShortcutRow}>
          <Pressable
            style={styles.keyboardShortcutButton}
            onPress={withHaptic(() => sendKeyboardShortcut("selectAll"))}
          >
            <Ionicons name="scan-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Select All</Text>
          </Pressable>
          <Pressable
            style={styles.keyboardShortcutButton}
            onPress={withHaptic(() => sendKeyboardShortcut("copy"))}
          >
            <Ionicons name="copy-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Copy</Text>
          </Pressable>
          <Pressable
            style={styles.keyboardShortcutButton}
            onPress={withHaptic(() => sendKeyboardShortcut("paste"))}
          >
            <Ionicons name="clipboard-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Paste</Text>
          </Pressable>
          <Pressable
            style={styles.keyboardShortcutButton}
            onPress={withHaptic(() => sendKeyboardShortcut("clear"))}
          >
            <Ionicons name="backspace-outline" size={18} color="#ffffff" />
            <Text style={styles.keyboardShortcutText}>Clear</Text>
          </Pressable>
        </View>
      </Animated.View>

      {showSettings ? (
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.settingsScroll, settingsAnimatedStyle]}
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
                style={[styles.connectButton]}
                onPress={withHaptic(openScanner)}
              >
                <Ionicons name="qr-code-outline" size={20} color="#1b1008" />
                <Text style={styles.connectText}>Scan</Text>
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
            <View style={styles.mediaControlRow}>
              <Pressable
                disabled={!brightnessAdjustable || brightnessStep === 0}
                style={[
                  styles.mediaStepButton,
                  !brightnessAdjustable || brightnessStep === 0
                    ? styles.disabledControl
                    : null,
                ]}
                onPress={withHaptic(() => adjustBrightnessStep(-1))}
              >
                <Ionicons name="remove" size={22} color="#ffffff" />
              </Pressable>
              <View style={styles.mediaLevelWrap}>
                <View style={styles.mediaValueRow}>
                  <Text
                    style={[
                      styles.mediaValueText,
                      !brightnessAdjustable ? styles.disabledText : null,
                    ]}
                  >
                    {formatPercent(brightness)}
                  </Text>
                  <Text
                    style={[
                      styles.mediaStepText,
                      !brightnessAdjustable ? styles.disabledText : null,
                    ]}
                  >
                    {formatStep(brightnessStep)}
                  </Text>
                </View>
                <View style={styles.mediaTickRow}>
                  {Array.from({ length: MEDIA_CONTROL_STEPS }).map(
                    (_, index) => (
                      <View
                        key={`brightness-${index}`}
                        style={[
                          styles.mediaTick,
                          brightnessStep !== null && index < brightnessStep
                            ? styles.brightnessTickActive
                            : null,
                          !brightnessAdjustable ? styles.disabledControl : null,
                        ]}
                      />
                    ),
                  )}
                </View>
              </View>
              <Pressable
                disabled={
                  !brightnessAdjustable ||
                  brightnessStep === MEDIA_CONTROL_STEPS
                }
                style={[
                  styles.mediaStepButton,
                  !brightnessAdjustable || brightnessStep === MEDIA_CONTROL_STEPS
                    ? styles.disabledControl
                    : null,
                ]}
                onPress={withHaptic(() => adjustBrightnessStep(1))}
              >
                <Ionicons name="add" size={22} color="#ffffff" />
              </Pressable>
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
              {hostDisplay?.volumeAdjustable === false ? (
                <Text style={styles.settingUnavailable}>Unavailable on TV</Text>
              ) : null}
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
              disabled={status !== "connected"}
              style={[
                styles.restartHostButton,
                status !== "connected" ? styles.disabledControl : null,
              ]}
              onPress={withHaptic(confirmRestartHost)}
            >
              <Ionicons name="reload-circle-outline" size={22} color="#ffffff" />
              <Text style={styles.restartHostText}>Force Restart Host</Text>
            </Pressable>
          </View>
        </Animated.ScrollView>
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
                style={styles.desktopSwitchButton}
                accessibilityLabel="Previous desktop"
                onPress={withHaptic(() => socket.sendSwipeSpaces("left"))}
              >
                <Ionicons
                  name="chevron-back-circle-outline"
                  size={25}
                  color="#ffb347"
                />
              </Pressable>
              <View style={styles.shortcutDivider} />
              <Pressable
                style={styles.desktopSwitchButton}
                accessibilityLabel="Next desktop"
                onPress={withHaptic(() => socket.sendSwipeSpaces("right"))}
              >
                <Ionicons
                  name="chevron-forward-circle-outline"
                  size={25}
                  color="#ffb347"
                />
              </Pressable>
            </View>

            <View style={styles.shortcutGroup}>
              <Pressable
                style={styles.desktopSwitchButton}
                accessibilityLabel="Previous browser page"
                onPress={withHaptic(() => socket.sendTextCommand("browserBack"))}
              >
                <Ionicons name="arrow-undo-outline" size={24} color="#c7bdb1" />
              </Pressable>
              <View style={styles.shortcutDivider} />
              <Pressable
                style={styles.desktopSwitchButton}
                accessibilityLabel="Next browser page"
                onPress={withHaptic(() =>
                  socket.sendTextCommand("browserForward"),
                )}
              >
                <Ionicons name="arrow-redo-outline" size={24} color="#c7bdb1" />
              </Pressable>
            </View>

            <View style={styles.shortcutGroup}>
              <Pressable
                style={styles.desktopSwitchButton}
                accessibilityLabel="Left arrow key"
                onPress={withHaptic(() => socket.sendKey("leftArrow"))}
              >
                <Ionicons name="play-back" size={24} color="#f4d0a2" />
              </Pressable>
              <View style={styles.shortcutDivider} />
              <Pressable
                style={styles.desktopSwitchButton}
                accessibilityLabel="Right arrow key"
                onPress={withHaptic(() => socket.sendKey("rightArrow"))}
              >
                <Ionicons name="play-forward" size={24} color="#f4d0a2" />
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
              onScroll={(dx, dy) => socket.sendScroll(dx, dy)}
              onZoom={(direction) => socket.sendZoom(direction)}
              onSwipeSpaces={(direction) => socket.sendSwipeSpaces(direction)}
            />
          </View>

          <View style={styles.mouseButtonRow}>
            <Pressable
              style={styles.mouseButton}
              onPress={withHaptic(() => socket.sendTextCommand("reload"))}
            >
              <Ionicons name="refresh" size={22} color="#ffffff" />
              <Text style={styles.mouseButtonText}>Refresh</Text>
            </Pressable>
            <Pressable
              style={[styles.mouseButton, styles.keyboardMouseButton]}
              onPress={withHaptic(
                keyboardVisible ? dismissKeyboardInput : focusKeyboard,
              )}
            >
              <Ionicons
                name={keyboardVisible ? "chevron-down" : "keypad-outline"}
                size={22}
                color="#1b1008"
              />
              <Text style={[styles.mouseButtonText, styles.accentButtonText]}>
                Keyboard
              </Text>
            </Pressable>
            <Pressable
              style={styles.mouseButton}
              onPress={withHaptic(() => socket.sendRightClick())}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#ffffff" />
              <Text style={styles.mouseButtonText}>Right Click</Text>
            </Pressable>
          </View>

          <TextInput
            key={keyboardInputKey}
            ref={keyboardInputRef}
            value={keyboardBuffer}
            onChangeText={handleKeyboardTextChange}
            onKeyPress={handleKeyboardKeyPress}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            multiline
            blurOnSubmit={false}
            keyboardAppearance="dark"
            style={styles.hiddenInput}
          />
        </>
      )}

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

            <View style={styles.scannerCameraFrame}>
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

      <Modal
        animationType="fade"
        transparent
        visible={shortcutModalVisible}
        onRequestClose={closeShortcutModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.shortcutModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingShortcutId ? "Edit Shortcut" : "Add Shortcut"}
              </Text>
              <Pressable
                style={styles.modalIconButton}
                onPress={withHaptic(closeShortcutModal)}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </Pressable>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                value={shortcutName}
                onChangeText={setShortcutName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Netflix"
                placeholderTextColor="#756f68"
                style={styles.formInput}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Website</Text>
              <TextInput
                value={shortcutWebsite}
                onChangeText={setShortcutWebsite}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="netflix.com"
                placeholderTextColor="#756f68"
                style={styles.formInput}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Icon</Text>
              <View style={styles.iconUploadRow}>
                <View style={styles.iconPreview}>
                  {shortcutIconUri ? (
                    <Image
                      source={{ uri: shortcutIconUri }}
                      style={styles.iconPreviewImage}
                    />
                  ) : (
                    <Text style={styles.iconPreviewText}>
                      {(shortcutName.trim()[0] ?? "?").toUpperCase()}
                    </Text>
                  )}
                </View>
                <Pressable
                  style={styles.uploadButton}
                  onPress={withHaptic(pickShortcutIcon)}
                >
                  <Ionicons name="image-outline" size={20} color="#ffffff" />
                  <Text style={styles.uploadButtonText}>Upload Image</Text>
                </Pressable>
              </View>
              {shortcutIconUri ? (
                <Pressable
                  style={styles.removeIconButton}
                  onPress={withHaptic(() => setShortcutIconUri(undefined))}
                >
                  <Text style={styles.removeIconText}>Remove Image</Text>
                </Pressable>
              ) : null}
            </View>

            {shortcutFormError ? (
              <Text style={styles.formError}>{shortcutFormError}</Text>
            ) : null}

            {editingShortcutId ? (
              <Pressable
                style={styles.deleteShortcutButton}
                onPress={withHaptic(deleteCustomShortcut)}
              >
                <Ionicons name="trash-outline" size={20} color="#ffb4b4" />
                <Text style={styles.deleteShortcutText}>Delete Shortcut</Text>
              </Pressable>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalActionButton, styles.cancelButton]}
                onPress={withHaptic(closeShortcutModal)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.saveButton]}
                onPress={withHaptic(saveCustomShortcut)}
              >
                <Text style={styles.saveButtonText}>
                  {editingShortcutId ? "Save" : "Add"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentToStep(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      MEDIA_CONTROL_STEPS,
      Math.round((value / 100) * MEDIA_CONTROL_STEPS),
    ),
  );
}

function stepToPercent(step: number): number {
  const clampedStep = Math.max(0, Math.min(MEDIA_CONTROL_STEPS, step));

  return Math.round((clampedStep / MEDIA_CONTROL_STEPS) * 100);
}

function formatPercent(value: number | null): string {
  return value === null ? "--%" : `${value}%`;
}

function formatStep(step: number | null): string {
  return step === null ? "--/16" : `${step}/16`;
}

function parsePairingPayload(raw: string): PairingPayload | null {
  const text = raw.trim();

  if (text.startsWith("ws://") || text.startsWith("wss://")) {
    return { url: text };
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      "url" in parsed &&
      parsed.type === "remote-control" &&
      typeof parsed.url === "string"
    ) {
      const hostName =
        ("hostName" in parsed && sanitizeHostName(parsed.hostName)) ||
        ("name" in parsed && sanitizeHostName(parsed.name)) ||
        undefined;

      return {
        url: parsed.url,
        hostName,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeHostName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim().replace(/\.local$/i, "");

  return cleanValue ? cleanValue.slice(0, 80) : null;
}

function parseSavedDevices(raw: string | null): SavedDevice[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): SavedDevice[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("host" in item) ||
        typeof item.host !== "string"
      ) {
        return [];
      }

      const host = item.host.trim();

      if (!host) {
        return [];
      }

      const name =
        "name" in item && typeof item.name === "string"
          ? item.name.trim().slice(0, 80)
          : "";
      const lastConnectedAt =
        "lastConnectedAt" in item &&
        typeof item.lastConnectedAt === "number" &&
        Number.isFinite(item.lastConnectedAt)
          ? item.lastConnectedAt
          : 0;

      return [
        {
          id: getDeviceId(host),
          name: name || getDeviceNameFromHost(host),
          host,
          lastConnectedAt,
        },
      ];
    });
  } catch {
    return [];
  }
}

function upsertDevice(
  devices: SavedDevice[],
  nextDevice: SavedDevice,
): SavedDevice[] {
  const withoutCurrent = devices.filter(
    (device) => device.host !== nextDevice.host,
  );

  return [nextDevice, ...withoutCurrent]
    .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
    .slice(0, 20);
}

function persistSavedDevices(devices: SavedDevice[]) {
  AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(devices)).catch(
    () => {
      // ignore storage errors
    },
  );
}

function getDeviceId(host: string): string {
  return host.trim().toLowerCase();
}

function getDeviceNameFromHost(host: string): string {
  const cleanHost = host
    .trim()
    .replace(/^wss?:\/\//, "")
    .replace(/\/$/, "");

  return cleanHost || "Desktop";
}

function parseCustomShortcuts(raw: string): CustomShortcut[] {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): CustomShortcut[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("id" in item) ||
        !("name" in item) ||
        !("url" in item) ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.url !== "string"
      ) {
        return [];
      }

      const url = normalizeWebsiteUrl(item.url);

      if (!item.name.trim() || !url) {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name.trim().slice(0, 40),
          url,
          iconUri:
            "iconUri" in item && typeof item.iconUri === "string"
              ? item.iconUri
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

function normalizeWebsiteUrl(value: string): string | null {
  const cleanValue = value.trim();

  if (cleanValue.length === 0) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(cleanValue)
    ? cleanValue
    : `https://${cleanValue}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#070707",
    flex: 1,
    gap: 12,
    paddingBottom: 14,
  },
  shortcuts: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
  },
  shortcutGroup: {
    alignItems: "center",
    backgroundColor: "#14110f",
    borderColor: "#2a2118",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 56,
    overflow: "hidden",
  },
  shortcutDivider: {
    backgroundColor: "#2a2118",
    height: 26,
    width: 1,
  },
  shortcutsScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 70,
    width: "100%",
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  connectText: {
    color: "#1b1008",
    fontSize: 15,
    fontWeight: "800",
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
    paddingBottom: 18,
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
  brightnessTickActive: {
    backgroundColor: "#ffb347",
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
    flexDirection: "row",
    minHeight: 118,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  keyboardPreviewText: {
    color: "#ffffff",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  keyboardPreviewTextEmpty: {
    color: "#5f5a54",
  },
  keyboardPreviewCursor: {
    backgroundColor: "#ff941f",
    borderRadius: 1,
    height: 22,
    marginLeft: 2,
    width: 2,
  },
  keyboardShortcutRow: {
    flexDirection: "row",
    gap: 8,
  },
  keyboardShortcutButton: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "#34261a",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 4,
  },
  keyboardShortcutText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  trackpadWrap: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: 18,
  },
  mouseButtonRow: {
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  mouseButton: {
    alignItems: "center",
    backgroundColor: "#15120f",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 12,
  },
  keyboardMouseButton: {
    backgroundColor: "#ff941f",
    borderColor: "#ffb347",
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
  hiddenInput: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
  scannerBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.86)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  scannerSheet: {
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
    aspectRatio: 1,
    backgroundColor: "#070707",
    borderColor: "#33261b",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
  },
  scannerCamera: {
    height: "100%",
    width: "100%",
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
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  shortcutModal: {
    backgroundColor: "#14110f",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  modalIconButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    color: "#cec8be",
    fontSize: 13,
    fontWeight: "800",
  },
  formInput: {
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  iconUploadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  iconPreview: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    width: 56,
  },
  iconPreviewImage: {
    height: "100%",
    width: "100%",
  },
  iconPreviewText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  removeIconButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  removeIconText: {
    color: "#ff941f",
    fontSize: 13,
    fontWeight: "800",
  },
  formError: {
    color: "#ff8a8a",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteShortcutButton: {
    alignItems: "center",
    backgroundColor: "#32191d",
    borderColor: "#5b2730",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  deleteShortcutText: {
    color: "#ffb4b4",
    fontSize: 15,
    fontWeight: "900",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalActionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  cancelButton: {
    backgroundColor: "#211a14",
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  saveButton: {
    backgroundColor: "#ff941f",
  },
  saveButtonText: {
    color: "#1b1008",
    fontSize: 15,
    fontWeight: "900",
  },
});
