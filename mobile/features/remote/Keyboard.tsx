import * as Clipboard from "expo-clipboard";
import { Keyboard as KeyboardIcon } from "lucide-react-native";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Keyboard as NativeKeyboard,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  type KeyboardEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from "react-native";
import { ScanGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import type { HostPlatform, TextCommand } from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";
import { RemoteKeyboardInput } from "./keyboard/RemoteKeyboardInput";
import { RemoteKeyboardPanel } from "./keyboard/RemoteKeyboardPanel";
import { RemoteKeyboardToolbar } from "./keyboard/RemoteKeyboardToolbar";
import {
  diffKeyboardText,
  replaceKeyboardSelection,
  splitTextIntoRemoteChunks,
} from "./keyboard/keyboardTextModel";
import { useKeyboardPanelAnimation } from "./keyboard/useKeyboardPanelAnimation";
export type { RemoteKeyboardHandle } from "./keyboard/types";
import type { RemoteKeyboardHandle } from "./keyboard/types";

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
    const bufferRef = useRef("");
    const keyboardSelectionRef = useRef({ start: 0, end: 0 });
    const remoteKeyboardCursorRef = useRef(0);
    const remoteKeyboardSelectionActiveRef = useRef(false);
    const [keyboardBuffer, setKeyboardBuffer] = useState("");
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [keyboardOverlay, setKeyboardOverlay] = useState(false);
    const [keyboardSelection, setKeyboardSelection] = useState({
      start: 0,
      end: 0,
    });
    const [keyboardInputKey, setKeyboardInputKey] = useState(0);
    const {
      keyboardBackdropAnimatedStyle,
      keyboardPanelAnimatedStyle,
      keyboardPanelDynamicStyle,
      keyboardUiMounted,
    } = useKeyboardPanelAnimation({
      keyboardHeight,
      keyboardOverlay,
      screenLayoutHeight,
      windowHeight,
    });

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
      if (!keyboardVisible) {
        keyboardActiveRef.current = false;
        setKeyboardOverlay(false);
        clearKeyboardInput();
      }
    }, [keyboardVisible]);

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
      splitTextIntoRemoteChunks(text).forEach((chunk) => {
        if (chunk.type === "enter") {
          socket.sendKey("enter");
        } else if (chunk.value) {
          socket.sendText(chunk.value);
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

      const {
        deletedCount,
        insertedText,
        syncCursorIndex,
      } = diffKeyboardText(prev, nextText);

      syncRemoteKeyboardCursor(syncCursorIndex);

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

      updateKeyboardBuffer(
        nextText,
        syncCursorIndex - deletedCount + insertedText.length,
      );
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
      const {
        nextCursor,
        nextText,
        selectionEnd,
        selectionStart,
      } = replaceKeyboardSelection(prev, keyboardSelectionRef.current, text);
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
      updateKeyboardBuffer(nextText, nextCursor);

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
      <RemoteKeyboardPanel
        backdropAnimatedStyle={keyboardBackdropAnimatedStyle}
        dynamicStyle={keyboardPanelDynamicStyle}
        onClose={dismissKeyboardInput}
        panelAnimatedStyle={keyboardPanelAnimatedStyle}
        uiMounted={keyboardUiMounted}
      >
        <RemoteKeyboardInput
          inputKey={keyboardInputKey}
          inputRef={inputRef}
          keyboardBuffer={keyboardBuffer}
          keyboardOverlay={keyboardOverlay}
          keyboardSelection={keyboardSelection}
          onKeyPress={handleKeyboardKeyPress}
          onSelectionChange={handleKeyboardSelectionChange}
          onTextChange={handleKeyboardTextChange}
        />
        <RemoteKeyboardToolbar
          buttonWidthStyle={keyboardShortcutButtonStyle}
          onInsertNewLine={insertKeyboardNewLine}
          onPasteFromPhone={pasteFromPhoneClipboard}
          onShortcut={sendKeyboardShortcut}
        />
      </RemoteKeyboardPanel>
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

const styles = StyleSheet.create({
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
