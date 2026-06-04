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
import type { ConnectionStatus, ShortcutId } from "../types/protocol";
import { RemoteSocket } from "../websocket/RemoteSocket";
import { withHaptic } from "../utils/haptics";
import DisneyPlusIcon from "../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../assets/shortcuts/netflix.svg";
import PrimeIcon from "../assets/shortcuts/prime.svg";
import SpotifyIcon from "../assets/shortcuts/spotify.svg";

const HOST_STORAGE_KEY = "remote-control:last-host";
const SENSITIVITY_STORAGE_KEY = "remote-control:sensitivity";
const CUSTOM_SHORTCUTS_STORAGE_KEY = "remote-control:custom-shortcuts";
const BRIGHTNESS_STEP = 10;
const DEFAULT_SENSITIVITY = 2.3;

interface CustomShortcut {
  id: string;
  name: string;
  url: string;
  iconUri?: string;
}

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
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>([]);
  const [shortcutModalVisible, setShortcutModalVisible] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutWebsite, setShortcutWebsite] = useState("");
  const [shortcutIconUri, setShortcutIconUri] = useState<string | undefined>();
  const [shortcutFormError, setShortcutFormError] = useState("");

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
      setShortcutFormError("Photo library permission is required to upload an icon.");
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

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Shortcuts</Text>
            <Pressable
              style={styles.addShortcutButton}
              onPress={withHaptic(openShortcutModal)}
            >
              <Ionicons name="add" size={22} color="#ffffff" />
              <Text style={styles.addShortcutText}>Add Shortcut</Text>
            </Pressable>
          </View>
        </>
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
          </ScrollView>

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
                placeholderTextColor="#697180"
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
                placeholderTextColor="#697180"
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
  shortcutsScroller: {
    width: "100%",
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
  addShortcutButton: {
    alignItems: "center",
    backgroundColor: "#2f6df6",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
  },
  addShortcutText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
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
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  shortcutModal: {
    backgroundColor: "#151922",
    borderColor: "#2a303c",
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
    backgroundColor: "#242b36",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    color: "#c8d0dd",
    fontSize: 13,
    fontWeight: "800",
  },
  formInput: {
    backgroundColor: "#0d1016",
    borderColor: "#2a303c",
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
    backgroundColor: "#0d1016",
    borderColor: "#2a303c",
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
    backgroundColor: "#242b36",
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
    color: "#9fb6ff",
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
    backgroundColor: "#242b36",
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  saveButton: {
    backgroundColor: "#2f6df6",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
});
