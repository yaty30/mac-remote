import { Icon } from "lucide-react-native";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { faceAlien } from "@lucide/lab";

const SplashLogoGradient =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;


interface AppSplashOverlayProps {
  visible: boolean;
}

export function AppSplashOverlay({ visible }: AppSplashOverlayProps) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoAnim = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fadeAnim.setValue(0);
      logoAnim.setValue(0.94);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoAnim, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [fadeAnim, logoAnim, visible]);

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.overlay, { opacity: fadeAnim }]}
    >
      <Animated.View
        style={[
          styles.logoShadow,
          {
            transform: [{ scale: logoAnim }],
          },
        ]}
      >
        <SplashLogoGradient
          colors={["#ffd27a", "#f0a942", "#c8762f"]}
          start={{ x: 0.18, y: 0 }}
          end={{ x: 0.82, y: 1 }}
          style={styles.logoGradient}
        >
          <Icon
            iconNode={faceAlien}
            size={58}
            color="#1b1008"
            strokeWidth={2.35}
          />
        </SplashLogoGradient>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "#070707",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 4000,
  },
  logoShadow: {
    alignItems: "center",
    height: 116,
    justifyContent: "center",
    shadowColor: "#f0a942",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 30,
    width: 116,
  },
  logoGradient: {
    alignItems: "center",
    borderRadius: 34,
    height: 96,
    justifyContent: "center",
    width: 96,
  },
});
