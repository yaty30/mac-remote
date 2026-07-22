import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { type ComponentType, type ReactNode } from "react";
import { withHaptic } from "../utils/haptics";

type GradientButtonIconPosition = "left" | "right";

interface GradientButtonProps {
  accessibilityLabel?: string;
  action?: () => void;
  buttonStyle?: StyleProp<ViewStyle>;
  colors?: LinearGradientProps["colors"];
  disabled?: boolean;
  disabledStyle?: StyleProp<ViewStyle>;
  end?: LinearGradientProps["end"];
  gradientStyle?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  iconPosition?: GradientButtonIconPosition;
  label?: string;
  labelStyle?: StyleProp<TextStyle>;
  longAction?: () => void;
  pressedStyle?: StyleProp<ViewStyle>;
  start?: LinearGradientProps["start"];
}

const GradientView =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;

const DEFAULT_SCAN_COLORS: LinearGradientProps["colors"] = [
  "rgba(44, 33, 23, 0.72)",
  "rgba(24, 20, 16, 0.72)",
  "rgba(14, 13, 11, 0.72)",
];
const DEFAULT_HEADER_COLORS = DEFAULT_SCAN_COLORS;
const DEFAULT_SCAN_START = { x: 0.18, y: 0 };
const DEFAULT_SCAN_END = { x: 0.82, y: 1 };
const DEFAULT_HEADER_START = { x: 0.15, y: 0 };
const DEFAULT_HEADER_END = { x: 0.85, y: 1 };

export function ScanGradientButton(props: GradientButtonProps) {
  return (
    <GradientButton
      {...props}
      colors={props.colors ?? DEFAULT_SCAN_COLORS}
      end={props.end ?? DEFAULT_SCAN_END}
      start={props.start ?? DEFAULT_SCAN_START}
    />
  );
}

export function HeaderGradientButton(props: GradientButtonProps) {
  return (
    <GradientButton
      {...props}
      colors={props.colors ?? DEFAULT_HEADER_COLORS}
      end={props.end ?? DEFAULT_HEADER_END}
      start={props.start ?? DEFAULT_HEADER_START}
    />
  );
}

function GradientButton({
  accessibilityLabel,
  action,
  buttonStyle,
  colors = DEFAULT_SCAN_COLORS,
  disabled = false,
  disabledStyle,
  end = DEFAULT_SCAN_END,
  gradientStyle,
  icon,
  iconPosition = "left",
  label,
  labelStyle,
  longAction,
  pressedStyle,
  start = DEFAULT_SCAN_START,
}: GradientButtonProps) {
  const resolvedAccessibilityLabel = accessibilityLabel ?? label;
  const iconBefore = icon && iconPosition === "left";
  const iconAfter = icon && iconPosition === "right";

  return (
    <Pressable
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onLongPress={longAction ? withHaptic(longAction) : undefined}
      onPress={action ? withHaptic(action) : undefined}
      style={(state: PressableStateCallbackType) => [
        buttonStyle,
        state.pressed && !disabled ? pressedStyle : null,
        disabled ? disabledStyle : null,
      ]}
    >
      <GradientView
        colors={colors}
        end={end}
        start={start}
        style={[styles.gradient, gradientStyle] as LinearGradientProps["style"]}
      >
        {iconBefore ? icon : null}
        {label ? <Text style={labelStyle}>{label}</Text> : null}
        {iconAfter ? icon : null}
      </GradientView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gradient: {
    alignItems: "center",
    justifyContent: "center",
  },
});
