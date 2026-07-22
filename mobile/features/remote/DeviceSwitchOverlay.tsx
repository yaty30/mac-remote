import { Ionicons } from "@expo/vector-icons";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingIconOverlay } from "../../components/FloatingIconOverlay";
import { withHaptic } from "../../utils/haptics";

interface DeviceSwitchOverlayProps {
  cancelAnimatedStyle: object;
  cancelVisible: boolean;
  name: string;
  onCancel: () => void;
  overlayAnimatedStyle: object;
  spinnerAnimatedStyle: object;
  visible: boolean;
}

export function DeviceSwitchOverlay({
  cancelAnimatedStyle,
  cancelVisible,
  name,
  onCancel,
  overlayAnimatedStyle,
  spinnerAnimatedStyle,
  visible,
}: DeviceSwitchOverlayProps) {
  return (
    <Modal animationType="none" transparent visible={visible}>
      <Animated.View
        accessibilityLabel="Connecting to device"
        accessibilityRole="alert"
        onStartShouldSetResponder={() => true}
        style={styles.overlay}
      >
        <FloatingIconOverlay active={visible} maxOpacity={0.26} spawnIntervalMs={520} />
        <Animated.View style={[styles.card, overlayAnimatedStyle]}>
          <View style={styles.spinner}>
            <Animated.View style={spinnerAnimatedStyle}>
              <Ionicons name="radio" size={22} color="#f0a942" />
            </Animated.View>
          </View>
          <Text style={styles.title}>Connecting</Text>
          <Text style={styles.deviceText} numberOfLines={1}>
            {name || "Selected device"}
          </Text>
          {cancelVisible ? (
            <Animated.View style={[styles.cancelSlot, cancelAnimatedStyle]}>
              <Pressable
                accessibilityLabel="Cancel device connection"
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
      </Animated.View>
    </Modal>
  );
}

export const overlayCardStyles = {
  card: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    minWidth: 210,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.38,
    shadowRadius: 26,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cancelButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    transform: [{ scale: 0.98 }],
  },
  cancelSlot: {
    marginTop: 4,
    overflow: "hidden",
  },
  cancelText: {
    color: "#f7f5f1",
    fontSize: 13,
    fontWeight: "800",
  },
  deviceText: {
    backgroundColor: "#f0aa422b",
    borderColor: "#f0aa42c9",
    borderRadius: 4,
    borderWidth: 1,
    color: "#f8aa34",
    fontSize: 14,
    fontWeight: "700",
    marginVertical: 6,
    maxWidth: 190,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  spinner: {
    alignItems: "center",
    backgroundColor: "rgba(240, 169, 66, 0.1)",
    borderColor: "rgba(240, 169, 66, 0.34)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  title: {
    color: "#f7f5f1",
    fontSize: 15,
    fontWeight: "900",
  },
} as const;

const styles = StyleSheet.create({
  ...overlayCardStyles,
  overlay: {
    alignItems: "center",
    backgroundColor: "#070707",
    bottom: 0,
    flex: 1,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2000,
  },
});
