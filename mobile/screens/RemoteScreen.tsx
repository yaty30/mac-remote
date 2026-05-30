import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import DisneyPlusIcon from "../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../assets/shortcuts/netflix.svg";
import PrimeIcon from "../assets/shortcuts/prime.svg";
import SpotifyIcon from "../assets/shortcuts/spotify.svg";

const HOST_STORAGE_KEY = "remote-control:last-host";

export function RemoteScreen() {
  const socket = useMemo(() => new RemoteSocket(), []);
  const keyboardInputRef = useRef<TextInput>(null);
  const bufferRef = useRef("");
  const [host, setHost] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [sensitivity, setSensitivity] = useState(1);
  const [brightness, setBrightness] = useState(50);
  const [volume, setVolume] = useState(50);
  const [keyboardBuffer, setKeyboardBuffer] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = socket.onStatus(setStatus);

    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, [socket]);

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
    if (status === "connected" && host.trim().length > 0) {
      AsyncStorage.setItem(HOST_STORAGE_KEY, host.trim()).catch(() => {
        // ignore storage errors
      });
    }
  }, [status, host]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function connect() {
    Keyboard.dismiss();

    if (host.trim().length === 0) {
      setStatus("error");
      return;
    }

    socket.connect(host);
  }

  function sendShortcut(shortcut: ShortcutId) {
    socket.sendShortcut(shortcut);
  }

  function adjustSensitivity(delta: number) {
    setSensitivity((current) => {
      const next = Math.max(0.25, Math.min(3, current + delta));
      return Math.round(next * 100) / 100;
    });
  }

  function adjustBrightness(delta: -1 | 1) {
    setBrightness((current) => {
      const next = Math.max(0, Math.min(100, current + delta * 10));
      return next;
    });
    socket.sendBrightness(delta);
  }

  function adjustVolume(delta: -1 | 1) {
    setVolume((current) => {
      const next = Math.max(0, Math.min(100, current + delta * 10));
      socket.sendVolume(next);
      return next;
    });
  }

  function focusKeyboard() {
    keyboardInputRef.current?.focus();
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

    const nextBuffer = nextText.length > 80 ? "" : nextText;
    bufferRef.current = nextBuffer;
    setKeyboardBuffer(nextBuffer);
  }

  function handleKeyboardKeyPress(
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) {
    if (
      event.nativeEvent.key === "Backspace" &&
      bufferRef.current.length === 0
    ) {
      socket.sendKey("backspace");
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        host={host}
        status={status}
        onHostChange={setHost}
        onConnect={connect}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((visible) => !visible)}
      />

      {showSettings ? (
        <>
          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Sensitivity</Text>
            <View style={styles.sensitivityControls}>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustSensitivity(-0.25)}
              >
                <Ionicons name="remove" size={22} color="#ffffff" />
              </Pressable>
              <Text style={styles.sensitivityValue}>
                {sensitivity.toFixed(2)}x
              </Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustSensitivity(0.25)}
              >
                <Ionicons name="add" size={22} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Brightness</Text>
            <View style={styles.sensitivityControls}>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustBrightness(-1)}
              >
                <Ionicons name="remove" size={22} color="#ffffff" />
              </Pressable>
              <Text style={styles.sensitivityValue}>
                {brightness}%
              </Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustBrightness(1)}
              >
                <Ionicons name="add" size={22} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityLabel}>Volume</Text>
            <View style={styles.sensitivityControls}>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustVolume(-1)}
              >
                <Ionicons name="remove" size={22} color="#ffffff" />
              </Pressable>
              <Text style={styles.sensitivityValue}>
                {volume}%
              </Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => adjustVolume(1)}
              >
                <Ionicons name="add" size={22} color="#ffffff" />
              </Pressable>
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
              icon="logo-youtube"
              label="YouTube"
              shortcut="youtube"
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
              onPress={() => socket.sendSwipeSpaces("left")}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </Pressable>
            <Pressable
              style={styles.desktopSwitchButton}
              onPress={() => socket.sendSwipeSpaces("right")}
            >
              <Ionicons name="arrow-forward" size={24} color="#ffffff" />
            </Pressable>
          </View>

          <View
            style={styles.trackpadWrap}
            onStartShouldSetResponder={() => keyboardVisible}
            onResponderRelease={() => keyboardVisible && Keyboard.dismiss()}
          >
            <Trackpad
              onMove={(dx, dy) =>
                socket.sendMove(dx * sensitivity, dy * sensitivity)
              }
              onClick={() => socket.sendLeftClick()}
              onRightClick={() => socket.sendRightClick()}
              onScroll={(dx, dy) => socket.sendScroll(dx, dy)}
              onZoom={(direction) => socket.sendZoom(direction)}
              onSwipeSpaces={(direction) => socket.sendSwipeSpaces(direction)}
            />
          </View>

          <View style={styles.keyboardWrap}>
            <Pressable
              style={styles.keyboardButton}
              onPress={keyboardVisible ? Keyboard.dismiss : focusKeyboard}
            >
              <Ionicons
                name={keyboardVisible ? "chevron-down" : "keypad-outline"}
                size={22}
                color="#ffffff"
              />
              <Text style={[{ ...styles.keyboardButtonText }]}>
                Type on Mac
              </Text>
            </Pressable>
            <TextInput
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
    alignItems: "center",
    backgroundColor: "#151922",
    borderColor: "#252c37",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 18,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  sensitivityLabel: {
    color: "#c8d0dd",
    fontSize: 14,
    fontWeight: "800",
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
