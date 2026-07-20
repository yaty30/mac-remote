import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type FloatingIconName = ComponentProps<typeof Ionicons>["name"];

const DEFAULT_ICONS: FloatingIconName[] = [
  "balloon-outline",
  "ice-cream-outline",
  "bowling-ball-outline",
  "pizza-outline",
  "leaf-outline",
  "beer-outline",
  "baseball-outline",
  "game-controller-outline",
  "rocket-outline",
];

interface FloatingIconParticle {
  id: number;
  icon: FloatingIconName;
  left: number;
  size: number;
  depth: number;
  drift: number;
  floatDistance: number;
  progress: Animated.Value;
  spin: Animated.Value;
  spinEnabled: boolean;
}

interface FloatingIconOverlayProps {
  active: boolean;
  color?: string;
  floatDurationMs?: number;
  icons?: FloatingIconName[];
  maxIconSize?: number;
  maxOpacity?: number;
  minFloatDistance?: number;
  minIconSize?: number;
  spawnIntervalMs?: number;
  spinDurationMaxMs?: number;
  spinDurationMinMs?: number;
  style?: StyleProp<ViewStyle>;
}

export function FloatingIconOverlay({
  active,
  color = "#f0a942",
  floatDurationMs = 5200,
  icons = DEFAULT_ICONS,
  maxIconSize = 30,
  maxOpacity = 0.6,
  minFloatDistance = 830,
  minIconSize = 12,
  spawnIntervalMs = 460,
  spinDurationMaxMs = 4200,
  spinDurationMinMs = 800,
  style,
}: FloatingIconOverlayProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const iconIdRef = useRef(0);
  const animationsRef = useRef(
    new Map<
      number,
      {
        float: ReturnType<typeof Animated.timing>;
        spin: ReturnType<typeof Animated.loop> | null;
        timeout: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const [particles, setParticles] = useState<FloatingIconParticle[]>([]);

  useEffect(() => {
    function clearParticles() {
      for (const animation of animationsRef.current.values()) {
        animation.float.stop();
        animation.spin?.stop();
        clearTimeout(animation.timeout);
      }

      animationsRef.current.clear();
      setParticles([]);
    }

    if (!active || icons.length === 0) {
      clearParticles();
      return;
    }

    function removeParticle(id: number) {
      const animation = animationsRef.current.get(id);

      if (animation) {
        animation.float.stop();
        animation.spin?.stop();
        clearTimeout(animation.timeout);
        animationsRef.current.delete(id);
      }

      setParticles((currentParticles) =>
        currentParticles.filter((particle) => particle.id !== id),
      );
    }

    function spawnParticle() {
      const id = iconIdRef.current + 1;
      iconIdRef.current = id;

      const progress = new Animated.Value(0);
      const spin = new Animated.Value(0);
      const icon = icons[Math.floor(Math.random() * icons.length)];
      const isBalloon = icon === "balloon-outline";
      const sizeRange = Math.max(0, maxIconSize - minIconSize);
      const depth = sizeRange === 0 ? 0 : Math.random();
      const size = minIconSize + Math.round(Math.pow(depth, 0.72) * sizeRange);
      const spinDurationRange = Math.max(
        0,
        spinDurationMaxMs - spinDurationMinMs,
      );
      const spinDuration =
        spinDurationMinMs +
        Math.round(Math.pow(depth, 1.15) * spinDurationRange) +
        Math.round(Math.random() * 180);
      const particleFloatDuration = isBalloon
        ? Math.round(floatDurationMs * 1.55 + Math.random() * 650)
        : floatDurationMs;
      const item: FloatingIconParticle = {
        id,
        icon,
        left: Math.random() * (windowWidth + 80) - 40,
        size,
        depth,
        drift: isBalloon ? Math.random() * 180 - 90 : Math.random() * 80 - 40,
        floatDistance: Math.max(minFloatDistance, windowHeight * 0.58),
        progress,
        spin,
        spinEnabled: !isBalloon,
      };
      const floatAnimation = Animated.timing(progress, {
        toValue: 1,
        duration: particleFloatDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      const spinAnimation = isBalloon
        ? null
        : Animated.loop(
            Animated.timing(spin, {
              toValue: 1,
              duration: spinDuration,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
          );
      const timeout = setTimeout(
        () => removeParticle(id),
        particleFloatDuration + 20,
      );

      animationsRef.current.set(id, {
        float: floatAnimation,
        spin: spinAnimation,
        timeout,
      });
      setParticles((currentParticles) => [...currentParticles, item]);
      spinAnimation?.start();
      floatAnimation.start(({ finished }) => {
        if (finished) {
          removeParticle(id);
        }
      });
    }

    spawnParticle();
    const interval = setInterval(spawnParticle, spawnIntervalMs);

    return () => {
      clearInterval(interval);
      clearParticles();
    };
  }, [
    active,
    floatDurationMs,
    icons,
    maxIconSize,
    minFloatDistance,
    minIconSize,
    spawnIntervalMs,
    spinDurationMaxMs,
    spinDurationMinMs,
    windowHeight,
    windowWidth,
  ]);

  return (
    <Animated.View pointerEvents="none" style={[styles.layer, style]}>
      {[...particles]
        .sort(
          (leftParticle, rightParticle) =>
            rightParticle.depth - leftParticle.depth,
        )
        .map((particle) => {
          const depth = particle.depth;
          const zIndex = Math.round((1 - depth) * 1000);
          const translateY = particle.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -particle.floatDistance],
          });
          const translateX = particle.progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, particle.drift, particle.drift * 0.35],
          });
          const opacity = particle.progress.interpolate({
            inputRange: [0, 0.12, 0.78, 1],
            outputRange: [0, maxOpacity, maxOpacity * 0.7, 0],
          });
          const rotate = particle.spin.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "360deg"],
          });

          return (
            <Animated.View
              key={particle.id}
              style={[
                styles.icon,
                {
                  bottom: -particle.size - 16,
                  left: particle.left,
                  opacity,
                  zIndex,
                  transform: particle.spinEnabled
                    ? [{ translateX }, { translateY }, { rotate }]
                    : [{ translateX }, { translateY }],
                },
              ]}
            >
              <Ionicons
                name={particle.icon}
                size={particle.size}
                color={particle.icon === "balloon-outline" ? "#ef4444" : color}
              />
            </Animated.View>
          );
        })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  icon: {
    position: "absolute",
  },
});
