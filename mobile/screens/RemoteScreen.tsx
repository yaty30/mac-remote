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
  AppState,
  type AppStateStatus,
  Keyboard,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "../components/Header";
import { ShortcutButton } from "../components/ShortcutButton";
import { Trackpad } from "../components/Trackpad";
import type { ConnectionStatus, ShortcutId } from "../types/protocol";
import { RemoteSocket } from "../websocket/RemoteSocket";
import { withHaptic } from "../utils/haptics";
import DisneyPlusIcon from "../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../assets/shortcuts/netflix.svg";
import PrimeIcon from "../assets/shortcuts/prime.svg";
import SpotifyIcon from "../assets/shortcuts/spotify.svg";

const HOST_STORAGE_KEY = "remote-control:last-host";
const SENSITIVITY_STORAGE_KEY = "remote-control:sensitivity";
const BRIGHTNESS_STEP = 10;
const DEFAULT_SENSITIVITY = 2.3;

export function RemoteScreen() {
  const socket = useMemo(() => new RemoteSocket(), []);
  const keyboardInputRef = useRef<TextInput>(null);
  const keyboardActiveRef = useRef(false);
  const bufferRef = useRef("");
  const scannerOpenRef = useRef(false);
  const brightnessRef = useRef(50);
  const hostRef = useRef("");
  const statusRef = useRef<ConnectionStatus>("idle");

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [host, setHost] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [brightness, setBrightness] = useState(50);
  const [volume, setVolume] = useState(50);
  const [keyboardBuffer, setKeyboardBuffer] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOverlay, setKeyboardOverlay] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [keyboardInputKey, setKeyboardInputKey] = useState(0);

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
      if (message.type === "hostState" && typeof message.volume === "number") {
        const next = clampPercent(message.volume);
        setVolume(next);
      }
    });

    return unsubscribe;
  }, [socket]);

  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
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

    AsyncStorage.getItem(HOST_STORAGE_KEY)
      .then((saved) => {
        if (cancelled || !saved) {
          return;
        }
        setHost(saved);
        socket.connect(saved);
      })
      .catch(() => {
        // ignore storage errors
      });

    return () => {
      cancelled = true;
    };
  }, [socket]);

  useEffect(() => {
    const subscription = CameraView.onModernBarcodeScanned((event) => {
      if (!scannerOpenRef.current) {
        return;
      }

      scannerOpenRef.current = false;
      CameraView.dismissScanner().catch(() => {
        // scanner may already be dismissed on Android
      });
      connectFromScan(event);
    });

    return () => subscription.remove();
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

  function connectToHost(nextHost: string) {
    const cleanHost = nextHost.trim();

    if (cleanHost.length === 0) {
      setStatus("error");
      return;
    }

    Keyboard.dismiss();
    setHost(cleanHost);
    AsyncStorage.setItem(HOST_STORAGE_KEY, cleanHost).catch(() => {
      // ignore storage errors
    });
    socket.connect(cleanHost);
  }

  function sendShortcut(shortcut: ShortcutId) {
    socket.sendShortcut(shortcut);
  }

  function sendSleep() {
    socket.sendSleep();
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
    await CameraView.launchScanner({ barcodeTypes: ["qr"] });
  }

  function connectFromScan(event: ScanningResult) {
    const scannedHost = parsePairingPayload(event.data);

    if (!scannedHost) {
      setStatus("error");
      return;
    }

    connectToHost(scannedHost);
  }

  function updateBrightness(nextValue: number) {
    const next = Math.round(nextValue / BRIGHTNESS_STEP) * BRIGHTNESS_STEP;
    const previous = brightnessRef.current;
    const steps = Math.round((next - previous) / BRIGHTNESS_STEP);

    if (steps !== 0) {
      const delta = steps > 0 ? 1 : -1;
      for (let index = 0; index < Math.abs(steps); index += 1) {
        socket.sendBrightness(delta);
      }
    }

    brightnessRef.current = next;
    setBrightness(next);
  }

  function updateVolume(nextValue: number) {
    const next = clampPercent(nextValue);
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

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable
        style={{
          ...styles.keyboardBg,
          display: keyboardOverlay ? "flex" : "none",
        }}
        onPress={dismissKeyboardInput}
      />

      <Header
        status={status}
        onScan={openScanner}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((visible) => !visible)}
        onSleep={sendSleep}
      />

      <View
        style={{
          ...styles.sensitivityCard,
          position: "absolute",
          bottom: 380,
          left: 18,
          right: 18,
          zIndex: 998,
          display: keyboardOverlay ? "flex" : "none",
        }}
      >
        <Text style={styles.sensitivityLabel}>Input</Text>
        <View style={{ ...styles.sliderRow, minHeight: 38, height: "auto" }}>
          <Text style={{ ...styles.sensitivityValue, textAlign: "left" }}>
            {typedText}
          </Text>
        </View>
      </View>

      {showSettings ? (
        <>
          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Connected Host</Text>
            <View style={styles.hostRow}>
              <Text style={styles.hostValue}>
                {host.trim().length > 0 ? host : "No host saved"}
              </Text>
              <Pressable
                style={[styles.connectButton]}
                onPress={withHaptic(openScanner)}
              >
                <Ionicons name="qr-code-outline" size={20} color="#ffffff" />
                <Text style={styles.connectText}>Scan</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Sensitivity</Text>
            <View style={styles.sliderRow}>
              <Slider
                style={styles.slider}
                minimumValue={0.25}
                maximumValue={3}
                step={0.05}
                value={sensitivity}
                minimumTrackTintColor="#2f6df6"
                maximumTrackTintColor="#303746"
                thumbTintColor="#ffffff"
                onValueChange={setSensitivity}
              />
              <Text style={styles.sensitivityValue}>
                {sensitivity.toFixed(2)}x
              </Text>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Brightness</Text>
            <View style={styles.sliderRow}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={brightness}
                minimumTrackTintColor="#f8df8c"
                maximumTrackTintColor="#303746"
                thumbTintColor="#ffffff"
                onValueChange={updateBrightness}
              />
              <Text style={styles.sensitivityValue}>{brightness}%</Text>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Volume</Text>
            <View style={styles.sliderRow}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={volume}
                minimumTrackTintColor="#8ff0b2"
                maximumTrackTintColor="#303746"
                thumbTintColor="#ffffff"
                onValueChange={updateVolume}
              />
              <Text style={styles.sensitivityValue}>{volume}%</Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.shortcuts}>
            <ShortcutButton
              SvgIcon={NetflixIcon}
              label="Netflix"
              shortcut="netflix"
              onPress={sendShortcut}
            />
            <ShortcutButton
              icon="logo-youtube"
              label="YouTube"
              shortcut="youtube"
              onPress={sendShortcut}
            />
            <ShortcutButton
              SvgIcon={DisneyPlusIcon}
              label="Disney+"
              shortcut="disney"
              onPress={sendShortcut}
            />
            <ShortcutButton
              SvgIcon={PrimeIcon}
              label="Amazon Prime"
              shortcut="amazon"
              onPress={sendShortcut}
            />
            <ShortcutButton
              SvgIcon={SpotifyIcon}
              label="Spotify"
              shortcut="spotify"
              onPress={sendShortcut}
            />
          </View>

          <View style={styles.shortcuts}>
            <Pressable
              style={styles.desktopSwitchButton}
              onPress={withHaptic(() => socket.sendSwipeSpaces("left"))}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </Pressable>
            <Pressable
              style={styles.desktopSwitchButton}
              onPress={withHaptic(() => socket.sendSwipeSpaces("right"))}
            >
              <Ionicons name="arrow-forward" size={24} color="#ffffff" />
            </Pressable>
            <Pressable
              style={styles.desktopSwitchButton}
              onPress={withHaptic(() => socket.sendKey("leftArrow"))}
            >
              <Ionicons
                name="play-forward"
                size={24}
                color="#ffffff"
                style={{ transform: [{ rotate: "-180deg" }] }}
              />
            </Pressable>
            <Pressable
              style={styles.desktopSwitchButton}
              onPress={withHaptic(() => socket.sendKey("rightArrow"))}
            >
              <Ionicons name="play-forward" size={24} color="#ffffff" />
            </Pressable>
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

          <View style={styles.keyboardWrap}>
            <Pressable
              style={styles.keyboardButton}
              onPress={withHaptic(
                keyboardVisible ? dismissKeyboardInput : focusKeyboard,
              )}
            >
              <Ionicons
                name={keyboardVisible ? "chevron-down" : "keypad-outline"}
                size={22}
                color="#ffffff"
              />
              <Text style={styles.keyboardButtonText}>Type on Mac</Text>
            </Pressable>

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
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function parsePairingPayload(raw: string): string | null {
  const text = raw.trim();

  if (text.startsWith("ws://") || text.startsWith("wss://")) {
    return text;
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
      return parsed.url;
    }
  } catch {
    return null;
  }

  return null;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#080a0e",
    flex: 1,
    gap: 12,
    paddingBottom: 14,
  },
  shortcuts: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#2f6df6",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  connectText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  desktopSwitchButton: {
    alignItems: "center",
    backgroundColor: "#191d25",
    borderColor: "#2a303c",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 8,
  },
  sensitivityCard: {
    alignItems: "stretch",
    backgroundColor: "#151922",
    borderColor: "#252c37",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 18,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sensitivityLabel: {
    color: "#c8d0dd",
    fontSize: 14,
    fontWeight: "800",
  },
  sliderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  hostRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  hostValue: {
    color: "#ffffff",
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
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
    backgroundColor: "#242b36",
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
  trackpadWrap: {
    flex: 1,
    minHeight: "58%",
    paddingHorizontal: 18,
  },
  keyboardBg: {
    backgroundColor: "transparent",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    width: "100%",
    zIndex: 999,
  },
  keyboardWrap: {
    minHeight: 58,
    paddingHorizontal: 18,
  },
  keyboardButton: {
    alignItems: "center",
    backgroundColor: "#2f6df6",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 56,
  },
  keyboardButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  hiddenInput: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
});
