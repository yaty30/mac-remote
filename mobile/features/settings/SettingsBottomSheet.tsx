import {
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  NativeModules,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  SETTINGS_FALLBACK_CLOSE_OFFSET,
  SETTINGS_FALLBACK_CLOSE_THRESHOLD,
} from "./bottomSheetConstants";

interface NativeBottomSheetProps {
  children: ReactNode;
  isOpened: boolean;
  onIsOpenedChange: (isOpened: boolean) => void;
  presentationDetents?: Array<"medium" | "large" | number>;
  presentationDragIndicator?: "automatic" | "visible" | "hidden";
}

interface SettingsBottomSheetProps {
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

function getNativeBottomSheet(): ComponentType<NativeBottomSheetProps> | null {
  const viewManagersMetadata =
    NativeModules.NativeUnimoduleProxy?.viewManagersMetadata;

  if (!viewManagersMetadata?.ExpoUI) {
    return null;
  }

  const expoUi = require("@expo/ui/swift-ui") as {
    BottomSheet: ComponentType<NativeBottomSheetProps>;
  };

  return expoUi.BottomSheet;
}

const NativeBottomSheet = getNativeBottomSheet();

export function SettingsBottomSheet({
  children,
  isOpen,
  onOpenChange,
}: SettingsBottomSheetProps) {
  const fallbackTranslateY = useRef(new Animated.Value(0)).current;
  const closeFallbackSheet = useMemo(
    () => () => {
      Animated.timing(fallbackTranslateY, {
        toValue: SETTINGS_FALLBACK_CLOSE_OFFSET,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onOpenChange(false);
      });
    },
    [fallbackTranslateY, onOpenChange],
  );
  const openFallbackSheet = useMemo(
    () => () => {
      fallbackTranslateY.setValue(SETTINGS_FALLBACK_CLOSE_OFFSET);
      Animated.timing(fallbackTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [fallbackTranslateY],
  );
  const fallbackPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 4,
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          fallbackTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            gestureState.dy > SETTINGS_FALLBACK_CLOSE_THRESHOLD ||
            gestureState.vy > 1.1
          ) {
            closeFallbackSheet();
            return;
          }

          Animated.spring(fallbackTranslateY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(fallbackTranslateY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeFallbackSheet, fallbackTranslateY],
  );

  if (NativeBottomSheet) {
    return (
      <NativeBottomSheet
        isOpened={isOpen}
        onIsOpenedChange={onOpenChange}
        presentationDetents={["large"]}
        presentationDragIndicator="visible"
      >
        {children}
      </NativeBottomSheet>
    );
  }

  return (
    <Modal
      animationType="none"
      onShow={openFallbackSheet}
      onRequestClose={closeFallbackSheet}
      transparent
      visible={isOpen}
    >
      <View style={styles.settingsFallbackOverlay}>
        <Pressable
          accessibilityLabel="Close settings"
          onPress={closeFallbackSheet}
          style={styles.settingsFallbackBackdrop}
        />
        <Animated.View
          style={[
            styles.settingsFallbackSheet,
            { transform: [{ translateY: fallbackTranslateY }] },
          ]}
        >
          <View
            accessibilityLabel="Drag down to close settings"
            accessibilityRole="adjustable"
            style={styles.settingsFallbackHandleZone}
            {...fallbackPanResponder.panHandlers}
          >
            <View style={styles.settingsFallbackHandle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsFallbackOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.52)",
    flex: 1,
    justifyContent: "flex-end",
  },
  settingsFallbackBackdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  settingsFallbackSheet: {
    backgroundColor: "#0b0a09",
    borderColor: "#2c2117",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    height: "94%",
    overflow: "hidden",
    paddingTop: 4,
  },
  settingsFallbackHandleZone: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
  },
  settingsFallbackHandle: {
    backgroundColor: "#5d5146",
    borderRadius: 2,
    height: 4,
    width: 42,
  },
});
