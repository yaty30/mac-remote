import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import type { SvgProps } from "react-native-svg";
import { withHaptic } from "../utils/haptics";

interface ShortcutButtonProps {
  icon?: keyof typeof Ionicons.glyphMap;
  imageUri?: string;
  initial?: string;
  SvgIcon?: ComponentType<SvgProps>;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export function ShortcutButton({
  icon,
  imageUri,
  initial,
  SvgIcon,
  label,
  onPress,
  onLongPress,
}: ShortcutButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      style={styles.button}
      onPress={withHaptic(onPress)}
      onLongPress={withHaptic(onLongPress)}
    >
      {SvgIcon ? (
        <SvgIcon width={44} height={44} />
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.imageIcon} />
      ) : initial ? (
        <Text style={styles.initialIcon}>{initial.slice(0, 1).toUpperCase()}</Text>
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
    justifyContent: "center",
    minHeight: 70,
    width: 68,
    paddingHorizontal: 8,
  },
  imageIcon: {
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  initialIcon: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
});
