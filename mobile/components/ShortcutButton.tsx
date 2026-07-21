import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import { Image, StyleSheet, Text } from "react-native";
import type { SvgProps } from "react-native-svg";
import { ScanGradientButton } from "./GradientButton";

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

  const shortcutIcon = SvgIcon ? (
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
  );

  return (
    <ScanGradientButton
      accessibilityLabel={label}
      action={onPress}
      buttonStyle={[
        styles.button,
        {
          borderRadius: Math.max(12, Math.round(size * 0.26)),
          height: size,
          width: size,
        },
      ]}
      colors={["#2b211a", "#1b1714", "#11100e"]}
      gradientStyle={styles.buttonGradient}
      icon={shortcutIcon}
      longAction={onLongPress}
      pressedStyle={styles.buttonPressed}
    />
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
