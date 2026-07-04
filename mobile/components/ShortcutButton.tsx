import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import type { SvgProps } from "react-native-svg";
import { withHaptic } from "../utils/haptics";

interface ShortcutButtonProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  imageUri?: string;
  initial?: string;
  SvgIcon?: ComponentType<SvgProps>;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export function ShortcutButton({
  icon,
  iconColor = "#ff0033",
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
        <SvgIcon width={36} height={36} />
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.imageIcon} />
      ) : initial ? (
        <Text style={styles.initialIcon}>{initial.slice(0, 1).toUpperCase()}</Text>
      ) : (
        <Ionicons name={icon ?? "apps-outline"} size={32} color={iconColor} />
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
    height: 70,
    width: 70,
    paddingHorizontal: 8,
  },
  imageIcon: {
    borderRadius: 8,
    height: 36,
    width: 36,
  },
  initialIcon: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
});
