import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingIconOverlay } from "../../components/FloatingIconOverlay";
import { ScanGradientButton } from "../../components/GradientButton";
import { withHaptic } from "../../utils/haptics";
import { overlayCardStyles } from "./DeviceSwitchOverlay";

const BODY_HORIZONTAL_PADDING = 10;

interface ConnectionPromptProps {
  authError: string | null;
  cancelAnimatedStyle: object;
  cancelVisible: boolean;
  host: string;
  hostName: string;
  inProgress: boolean;
  onCancel: () => void;
  onScan: () => void;
  spinnerAnimatedStyle: object;
  visible: boolean;
}

export function ConnectionPrompt({
  authError,
  cancelAnimatedStyle,
  cancelVisible,
  host,
  hostName,
  inProgress,
  onCancel,
  onScan,
  spinnerAnimatedStyle,
  visible,
}: ConnectionPromptProps) {
  return (
    <View style={styles.connectionPrompt}>
      <FloatingIconOverlay active={visible} maxOpacity={0.26} />
      {inProgress ? (
        <Animated.View
          accessibilityLabel="Connecting to host"
          accessibilityRole="alert"
          style={styles.card}
        >
          <View style={styles.spinner}>
            <Animated.View style={spinnerAnimatedStyle}>
              <Ionicons name="sync" size={22} color="#f0a942" />
            </Animated.View>
          </View>
          <Text style={styles.title}>Connecting</Text>
          <Text style={styles.deviceText} numberOfLines={1}>
            {hostName || host || "Selected device"}
          </Text>
          {cancelVisible ? (
            <Animated.View style={[styles.cancelSlot, cancelAnimatedStyle]}>
              <Pressable
                accessibilityLabel="Cancel connection"
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed ? styles.cancelButtonPressed : null,
                ]}
                onPress={withHaptic(onCancel)}
              >
                <Ionicons name="close" size={16} color="#f7f5f1" />
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : (
        <ScanGradientButton
          accessibilityLabel="Scan to connect to host"
          action={onScan}
          buttonStyle={styles.connectionPromptButton}
          colors={[
            "rgba(44, 33, 23, 0.72)",
            "rgba(24, 20, 16, 0.72)",
            "rgba(14, 13, 11, 0.72)",
          ]}
          end={{ x: 0.9, y: 1 }}
          gradientStyle={styles.connectionPromptButtonGradient}
          icon={<Ionicons name="scan-outline" size={23} color="#f0a942" />}
          label="Scan to Connect"
          labelStyle={styles.connectionPromptButtonText}
          pressedStyle={styles.mouseButtonPressed}
          start={{ x: 0.1, y: 0 }}
        />
      )}
      {authError ? (
        <Text style={styles.connectionPromptError}>{authError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ...overlayCardStyles,
  cancelSlot: {
    ...overlayCardStyles.cancelSlot,
    marginTop: 12,
    zIndex: 1,
  },
  connectionPrompt: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
    position: "relative",
  },
  connectionPromptButton: {
    backgroundColor: "rgba(31, 25, 18, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.62)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    zIndex: 1,
  },
  connectionPromptButtonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 58,
    overflow: "hidden",
    paddingHorizontal: 22,
  },
  connectionPromptButtonText: {
    color: "#f0a942",
    fontSize: 15,
    fontWeight: "900",
  },
  connectionPromptError: {
    color: "#ff8a72",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 14,
    maxWidth: 310,
    textAlign: "center",
    zIndex: 1,
  },
  mouseButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
