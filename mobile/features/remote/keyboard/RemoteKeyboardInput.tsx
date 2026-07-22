import {
  StyleSheet,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from "react-native";
import type { RefObject } from "react";
import type { KeyboardSelection } from "./types";

interface RemoteKeyboardInputProps {
  inputKey: number;
  inputRef: RefObject<TextInput | null>;
  keyboardBuffer: string;
  keyboardOverlay: boolean;
  keyboardSelection: KeyboardSelection;
  onKeyPress: (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => void;
  onSelectionChange: (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => void;
  onTextChange: (nextText: string) => void;
}

export function RemoteKeyboardInput({
  inputKey,
  inputRef,
  keyboardBuffer,
  keyboardOverlay,
  keyboardSelection,
  onKeyPress,
  onSelectionChange,
  onTextChange,
}: RemoteKeyboardInputProps) {
  return (
    <TextInput
      key={inputKey}
      ref={inputRef}
      value={keyboardBuffer}
      onChangeText={onTextChange}
      onKeyPress={onKeyPress}
      onSelectionChange={onSelectionChange}
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
  );
}

const styles = StyleSheet.create({
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
});
