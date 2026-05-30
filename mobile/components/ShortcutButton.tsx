import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { SvgProps } from "react-native-svg";
import type { ShortcutId } from "../types/protocol";

interface ShortcutButtonProps {
  icon?: keyof typeof Ionicons.glyphMap;
  SvgIcon?: ComponentType<SvgProps>;
  label: string;
  shortcut: ShortcutId;
  onPress: (shortcut: ShortcutId) => void;
}

export function ShortcutButton({
  icon,
  SvgIcon,
  label,
  shortcut,
  onPress,
}: ShortcutButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      style={styles.button}
      onPress={() => onPress(shortcut)}
    >
      {SvgIcon ? (
        <SvgIcon width={44} height={44} />
      ) : (
        <Ionicons name={icon ?? "apps-outline"} size={32} color="#ff0033" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "#1a1d30",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: 8
  }
});
