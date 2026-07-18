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
  size?: number;
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
  size = 70,
}: ShortcutButtonProps) {
  const iconSize = Math.max(24, Math.round(size * 0.51));
  const initialSize = Math.max(18, Math.round(size * 0.34));

  return (
    <Pressable
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: Math.max(12, Math.round(size * 0.26)),
          height: size,
          width: size,
        },
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
          <SvgIcon width={iconSize} height={iconSize} />
        ) : imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.imageIcon,
              {
                borderRadius: Math.max(6, Math.round(size * 0.11)),
                height: iconSize,
                width: iconSize,
              },
            ]}
          />
        ) : initial ? (
          <Text style={[styles.initialIcon, { fontSize: initialSize }]}>
            {initial.slice(0, 1).toUpperCase()}
          </Text>
        ) : (
          <Ionicons
            name={icon ?? "apps-outline"}
            size={Math.max(22, Math.round(size * 0.46))}
            color={iconColor}
          />
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
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    justifyContent: "center",
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
  },
  initialIcon: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
});
