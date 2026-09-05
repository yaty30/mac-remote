import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FloatingIconOverlay } from "./FloatingIconOverlay";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface FullScreenLoadingOverlayProps {
  accessibilityLabel?: string;
  icon?: IoniconName;
  label: string;
  onHidden?: () => void;
  visible: boolean;
}

export function FullScreenLoadingOverlay({
  accessibilityLabel,
  icon = "sync",
  label,
  onHidden,
  visible,
}: FullScreenLoadingOverlayProps) {
  const [mounted, setMounted] = useState(visible);
  const overlayAnimation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const spinnerAnimation = useRef(new Animated.Value(0)).current;
  const onHiddenRef = useRef(onHidden);

  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      overlayAnimation.stopAnimation();
      Animated.timing(overlayAnimation, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) {
      return;
    }

    overlayAnimation.stopAnimation();
    Animated.timing(overlayAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onHiddenRef.current?.();
      }
    });
  }, [mounted, overlayAnimation, visible]);

  useEffect(() => {
    if (!mounted) {
      spinnerAnimation.stopAnimation();
      spinnerAnimation.setValue(0);
      return;
    }

    spinnerAnimation.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(spinnerAnimation, {
          toValue: 0.45,
          duration: 520,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(spinnerAnimation, {
          toValue: 1,
          duration: 860,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [mounted, spinnerAnimation]);

  if (!mounted) {
    return null;
  }

  const cardStyle = {
    opacity: overlayAnimation,
    transform: [
      {
        scale: overlayAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
      {
        translateY: overlayAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };
  const spinnerStyle = {
    transform: [
      {
        rotate: spinnerAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };

  return (
    <Modal animationType="none" transparent visible={mounted}>
      <Animated.View
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="alert"
        onStartShouldSetResponder={() => true}
        style={styles.overlay}
      >
        <FloatingIconOverlay
          active={mounted}
          maxOpacity={0.26}
          spawnIntervalMs={520}
        />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.spinner}>
            <Animated.View style={spinnerStyle}>
              <Ionicons name={icon} size={22} color="#f0a942" />
            </Animated.View>
          </View>
          <Text style={styles.title}>{label}</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    fontFamily: "Ubuntu-Bold",
    fontSize: 15,
  },
});
