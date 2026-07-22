import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Keyboard as KeyboardIcon } from "lucide-react-native";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard as NativeKeyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  type KeyboardEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from "react-native";
import { ScanGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import { TEXT_SEND_CHUNK_SIZE } from "../keyboard/constants";
import type { HostPlatform, TextCommand } from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";

const BODY_HORIZONTAL_PADDING = 10;
const KEYBOARD_PANEL_KEYBOARD_GAP = 12;
const KEYBOARD_PANEL_TOP = 106;
const KEYBOARD_PANEL_RESTING_BOTTOM = 112;

export interface RemoteKeyboardHandle {
  close: () => void;
  isVisible: () => boolean;
  open: () => void;
  toggle: () => void;
}

interface RemoteKeyboardProps {
  hostPlatform: HostPlatform | null;
  screenLayoutHeight: number;
  socket: RemoteSocket;
}

export const RemoteKeyboard = forwardRef<RemoteKeyboardHandle, RemoteKeyboardProps>(
  ({ hostPlatform, screenLayoutHeight, socket }, ref) => {
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const inputRef = useRef<TextInput>(null);
    const keyboardActiveRef = useRef(false);
    const fullScreenLayoutHeightRef = useRef(windowHeight);
    const bufferRef = useRef("");
    const keyboardSelectionRef = useRef({ start: 0, end: 0 });
    const remoteKeyboardCursorRef = useRef(0);
    const remoteKeyboardSelectionActiveRef = useRef(false);
    const keyboardPanelAnim = useRef(new Animated.Value(0)).current;
    const [keyboardBuffer, setKeyboardBuffer] = useState("");
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [keyboardOverlay, setKeyboardOverlay] = useState(false);
    const [keyboardUiMounted, setKeyboardUiMounted] = useState(false);
    const [keyboardSelection, setKeyboardSelection] = useState({
      start: 0,
      end: 0,
    });
    const [keyboardInputKey, setKeyboardInputKey] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        close: dismissKeyboardInput,
        isVisible: () => keyboardOverlay || keyboardVisible,
        open: focusKeyboard,
        toggle: () => {
          if (keyboardOverlay || keyboardVisible) {
            dismissKeyboardInput();
            return;
          }

          focusKeyboard();
        },
      }),
      [keyboardOverlay, keyboardVisible],
    );

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

      const hideSub = NativeKeyboard.addListener("keyboardDidHide", () => {
        setKeyboardHeight(0);
        setKeyboardVisible(false);
      });
      const showSub = NativeKeyboard.addListener(
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

    function clearKeyboardInput() {
      inputRef.current?.setNativeProps({ text: "" });
      bufferRef.current = "";
      keyboardSelectionRef.current = { start: 0, end: 0 };
      remoteKeyboardCursorRef.current = 0;
      remoteKeyboardSelectionActiveRef.current = false;
      setKeyboardBuffer("");
      setKeyboardSelection({ start: 0, end: 0 });
      setKeyboardInputKey((current) => current + 1);
    }

    function clearKeyboardTextArea() {
      inputRef.current?.setNativeProps({ text: "" });
      bufferRef.current = "";
      keyboardSelectionRef.current = { start: 0, end: 0 };
      remoteKeyboardCursorRef.current = 0;
      remoteKeyboardSelectionActiveRef.current = false;
      setKeyboardBuffer("");
      setKeyboardSelection({ start: 0, end: 0 });
    }

    function dismissKeyboardInput() {
      keyboardActiveRef.current = false;
      NativeKeyboard.dismiss();
      setKeyboardOverlay(false);
      clearKeyboardInput();
    }

    function focusKeyboard() {
      keyboardActiveRef.current = true;
      inputRef.current?.blur();
      clearKeyboardInput();
      setKeyboardOverlay(true);

      if (Platform.OS === "android") {
        inputRef.current?.focus();
      }

      refocusKeyboardInput();
    }

    function refocusKeyboardInput() {
      const focusInput = () => {
        inputRef.current?.focus();
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

      if (!keyboardActiveRef.current || selection.start !== selection.end) {
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

    const androidKeyboardPanelTop = clamp(
      Math.round(windowHeight * 0.08),
      54,
      76,
    );
    const androidKeyboardPanelGap = clamp(
      Math.round(windowHeight * 0.09),
      56,
      82,
    );
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
      keyboardOverlay &&
      Platform.OS === "android" &&
      !androidParentAlreadyResized
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
      <>
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

        <Animated.View
          style={[
            styles.keyboardPanel,
            keyboardUiMounted ? null : styles.keyboardPanelHidden,
            keyboardPanelDynamicStyle,
            keyboardPanelAnimatedStyle,
          ]}
          pointerEvents={keyboardUiMounted ? "auto" : "none"}
        >
          <ViewHeader onClose={dismissKeyboardInput} />

          <TextInput
            key={keyboardInputKey}
            ref={inputRef}
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
              keyboardBuffer ? null : styles.keyboardPreviewEmpty,
            ]}
          />

          <Animated.View style={styles.keyboardShortcutGrid}>
            <KeyboardShortcutButton
              action={() => sendKeyboardShortcut("selectAll")}
              icon={<Ionicons name="scan-outline" size={18} color="#f0c17c" />}
              label="Select All"
              widthStyle={keyboardShortcutButtonStyle}
            />
            <KeyboardShortcutButton
              action={insertKeyboardNewLine}
              icon={
                <Ionicons
                  name="return-down-forward-outline"
                  size={18}
                  color="#f0c17c"
                />
              }
              label="New Line"
              widthStyle={keyboardShortcutButtonStyle}
            />
            <KeyboardShortcutButton
              action={() => sendKeyboardShortcut("copy")}
              icon={<Ionicons name="copy-outline" size={18} color="#f0c17c" />}
              label="Copy"
              widthStyle={keyboardShortcutButtonStyle}
            />
            <KeyboardShortcutButton
              action={() => sendKeyboardShortcut("paste")}
              icon={
                <Ionicons name="clipboard-outline" size={18} color="#f0c17c" />
              }
              label="Paste"
              widthStyle={keyboardShortcutButtonStyle}
            />
            <KeyboardShortcutButton
              action={pasteFromPhoneClipboard}
              colors={["#3b2816", "#211811", "#11100e"]}
              icon={
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  color="#f0a942"
                />
              }
              label="Paste Phone"
              widthStyle={keyboardShortcutButtonStyle}
            />
            <KeyboardShortcutButton
              action={() => sendKeyboardShortcut("clear")}
              colors={["#342019", "#211613", "#11100e"]}
              icon={
                <Ionicons
                  name="backspace-outline"
                  size={18}
                  color="#ffb08a"
                />
              }
              label="Clear"
              widthStyle={keyboardShortcutButtonStyle}
            />
          </Animated.View>
        </Animated.View>
      </>
    );
  },
);

interface KeyboardControlButtonProps {
  keyboardRef: React.RefObject<RemoteKeyboardHandle | null>;
}

export function KeyboardControlButton({ keyboardRef }: KeyboardControlButtonProps) {
  return (
    <TourTarget targetKey="keyboard-button" style={styles.keyboardButtonTourTarget}>
      <ScanGradientButton
        action={() => keyboardRef.current?.toggle()}
        buttonStyle={[styles.mouseButton, styles.keyboardMouseButton]}
        colors={[
          "rgba(44, 33, 23, 0.72)",
          "rgba(24, 20, 16, 0.72)",
          "rgba(14, 13, 11, 0.72)",
        ]}
        end={{ x: 0.9, y: 1 }}
        gradientStyle={styles.keyboardMouseButtonGradient}
        icon={<KeyboardIcon size={23} color="#f0a942" />}
        label="Keyboard"
        labelStyle={[styles.mouseButtonText, styles.accentButtonText]}
        pressedStyle={styles.mouseButtonPressed}
        start={{ x: 0.1, y: 0 }}
      />
    </TourTarget>
  );
}

function ViewHeader({ onClose }: { onClose: () => void }) {
  return (
    <Animated.View style={styles.keyboardPanelHeader}>
      <Animated.View style={styles.keyboardPanelTitleRow}>
        <Animated.View style={styles.keyboardPanelIcon}>
          <Animated.View style={styles.keyboardPanelIconGradient}>
            <KeyboardIcon size={18} color="#f0a942" />
          </Animated.View>
        </Animated.View>
        <Text style={styles.keyboardPanelTitle}>Keyboard</Text>
      </Animated.View>
      <ScanGradientButton
        accessibilityLabel="Close keyboard panel"
        action={onClose}
        buttonStyle={styles.keyboardPanelClose}
        colors={["#4b211c", "#321917", "#1b1110"]}
        gradientStyle={styles.keyboardPanelCloseGradient}
        icon={<Ionicons name="close" size={20} color="#ff8a72" />}
        pressedStyle={styles.keyboardPanelClosePressed}
      />
    </Animated.View>
  );
}

function KeyboardShortcutButton({
  action,
  colors = ["#2b211a", "#1b1714", "#11100e"],
  icon,
  label,
  widthStyle,
}: {
  action: () => void;
  colors?: [string, string, string];
  icon: ReactNode;
  label: string;
  widthStyle: object;
}) {
  return (
    <ScanGradientButton
      action={action}
      buttonStyle={[styles.keyboardShortcutButton, widthStyle]}
      colors={colors}
      gradientStyle={styles.keyboardShortcutGradient}
      icon={icon}
      label={label}
      labelStyle={styles.keyboardShortcutText}
      pressedStyle={styles.keyboardShortcutButtonPressed}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  keyboardBg: {
    backgroundColor: "rgba(7, 7, 7, 0.82)",
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
    zIndex: 999,
  },
  keyboardBgPressable: {
    flex: 1,
  },
  keyboardPanel: {
    backgroundColor: "rgba(18, 17, 15, 0.94)",
    borderColor: "rgba(240, 169, 66, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 18,
    gap: 14,
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
  keyboardButtonTourTarget: {
    flex: 4,
  },
  keyboardMouseButton: {
    backgroundColor: "rgba(31, 25, 18, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.62)",
    flex: 1,
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
});
