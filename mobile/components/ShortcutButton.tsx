import { Ionicons } from "@expo/vector-icons";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
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

const ShortcutGradient =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;

export function ShortcutButton({
  icon,
  iconColor = "#ff941f",
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
      style={({ pressed }) => [
        styles.button,
        pressed ? styles.buttonPressed : null,
      ]}
      onPress={withHaptic(onPress)}
      onLongPress={withHaptic(onLongPress)}
    >
      <ShortcutGradient
        colors={["#2b211a", "#1b1714", "#11100e"]}
        start={{ x: 0.18, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={styles.buttonGradient}
      >
        {SvgIcon ? (
          <SvgIcon width={36} height={36} />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imageIcon} />
        ) : initial ? (
          <Text style={styles.initialIcon}>
            {initial.slice(0, 1).toUpperCase()}
          </Text>
        ) : (
          <Ionicons name={icon ?? "apps-outline"} size={32} color={iconColor} />
        )}
      </ShortcutGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#15120f",
    borderColor: "#4a3124",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    justifyContent: "center",
    height: 70,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    width: 70,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  buttonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    width: "100%",
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
