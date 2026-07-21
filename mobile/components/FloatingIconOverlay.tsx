import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Balloon,
  Beer,
  Rabbit,
  Turtle,
  Gamepad2,
  IceCreamBowl,
  Leaf,
  Pizza,
  Rocket,
  Heart,
  Rose,
  Ghost,
  Icon,
  LucideProps
} from "lucide-react-native";
import { faceAlien, hockeyMask } from "@lucide/lab";

/**
 * All Lucide React Native icons share the same component type.
 * Using an existing icon's type avoids relying on icon-name strings.
 */
export type FloatingLucideIcon = typeof Rocket;

function FaceAlien(props: LucideProps) {
  return <Icon iconNode={faceAlien} {...props} />;
}

function HockeyMask(props: LucideProps) {
  return <Icon iconNode={hockeyMask} {...props} />;
}

const DEFAULT_ICONS: FloatingLucideIcon[] = [
  Balloon,
  IceCreamBowl,
  Turtle,
  Pizza,
  Leaf,
  Beer,
  Rabbit,
  Gamepad2,
  Rocket,
  Heart,
  Rose,
  Ghost,
  FaceAlien,
  HockeyMask
];

interface FloatingIconParticle {
  id: number;
  Icon: FloatingLucideIcon;
  left: number;
  size: number;
  depth: number;
  drift: number;
  floatDistance: number;
  progress: Animated.Value;
  spin: Animated.Value;
  spinEnabled: boolean;
  isBalloon: boolean;
}

interface FloatingIconOverlayProps {
  active: boolean;
  color?: string;
  floatDurationMs?: number;

  /**
   * Pass Lucide icon components directly:
   *
   * icons={[Rocket, Pizza, Gamepad2]}
   */
  icons?: FloatingLucideIcon[];

  maxIconSize?: number;
  maxOpacity?: number;
  minFloatDistance?: number;
  minIconSize?: number;
  spawnIntervalMs?: number;
  spinDurationMaxMs?: number;
  spinDurationMinMs?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

interface ParticleAnimations {
  float: ReturnType<typeof Animated.timing>;
  spin: ReturnType<typeof Animated.loop> | null;
  timeout: ReturnType<typeof setTimeout>;
}

export function FloatingIconOverlay({
  active,
  color = "#f0a942",
  floatDurationMs = 5200,
  icons = DEFAULT_ICONS,
  maxIconSize = 30,
  maxOpacity = 0.2,
  minFloatDistance = 740,
  minIconSize = 12,
  spawnIntervalMs = 460,
  spinDurationMaxMs = 4200,
  spinDurationMinMs = 800,
  strokeWidth = 1.8,
  style,
}: FloatingIconOverlayProps) {
  const { height: windowHeight, width: windowWidth } =
    useWindowDimensions();

  const iconIdRef = useRef(0);

  const animationsRef = useRef(
    new Map<number, ParticleAnimations>(),
  );

  const [particles, setParticles] = useState<
    FloatingIconParticle[]
  >([]);

  useEffect(() => {
    function stopParticleAnimations(
      animation: ParticleAnimations,
    ) {
      animation.float.stop();
      animation.spin?.stop();
      clearTimeout(animation.timeout);
    }

    function clearParticles() {
      for (const animation of animationsRef.current.values()) {
        stopParticleAnimations(animation);
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
        stopParticleAnimations(animation);
        animationsRef.current.delete(id);
      }

      setParticles((currentParticles) =>
        currentParticles.filter(
          (particle) => particle.id !== id,
        ),
      );
    }

    function spawnParticle() {
      const id = iconIdRef.current + 1;
      iconIdRef.current = id;

      const progress = new Animated.Value(0);
      const spin = new Animated.Value(0);

      const Icon =
        icons[Math.floor(Math.random() * icons.length)];

      const isBalloon = Icon === Balloon;

      const sizeRange = Math.max(
        0,
        maxIconSize - minIconSize,
      );

      const depth =
        sizeRange === 0
          ? 0
          : Math.random();

      const size =
        minIconSize +
        Math.round(
          Math.pow(depth, 0.72) * sizeRange,
        );

      const spinDurationRange = Math.max(
        0,
        spinDurationMaxMs - spinDurationMinMs,
      );

      const spinDuration =
        spinDurationMinMs +
        Math.round(
          Math.pow(depth, 1.15) *
            spinDurationRange,
        ) +
        Math.round(Math.random() * 180);

      const particleFloatDuration = isBalloon
        ? Math.round(
            floatDurationMs * 1.55 +
              Math.random() * 650,
          )
        : floatDurationMs;

      const particle: FloatingIconParticle = {
        id,
        Icon,
        left:
          Math.random() *
            (windowWidth + 80) -
          40,
        size,
        depth,
        drift: isBalloon
          ? Math.random() * 180 - 90
          : Math.random() * 80 - 40,
        floatDistance: Math.max(
          minFloatDistance,
          windowHeight * 0.58,
        ),
        progress,
        spin,
        spinEnabled: !isBalloon,
        isBalloon,
      };

      const floatAnimation = Animated.timing(
        progress,
        {
          toValue: 1,
          duration: particleFloatDuration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        },
      );

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

      /*
       * Safety timeout in case the animation completion
       * callback is interrupted or skipped by the platform.
       */
      const timeout = setTimeout(
        () => removeParticle(id),
        particleFloatDuration + 50,
      );

      animationsRef.current.set(id, {
        float: floatAnimation,
        spin: spinAnimation,
        timeout,
      });

      setParticles((currentParticles) => [
        ...currentParticles,
        particle,
      ]);

      spinAnimation?.start();

      floatAnimation.start(({ finished }) => {
        if (finished) {
          removeParticle(id);
        }
      });
    }

    spawnParticle();

    const interval = setInterval(
      spawnParticle,
      spawnIntervalMs,
    );

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
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, style]}
    >
      {[...particles]
        .sort(
          (leftParticle, rightParticle) =>
            rightParticle.depth -
            leftParticle.depth,
        )
        .map((particle) => {
          const {
            Icon,
            depth,
            drift,
            floatDistance,
            isBalloon,
            progress,
            size,
            spin,
            spinEnabled,
          } = particle;

          const zIndex = Math.round(
            (1 - depth) * 1000,
          );

          const translateY = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -floatDistance],
          });

          const translateX = progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [
              0,
              drift,
              drift * 0.35,
            ],
          });

          const opacity = progress.interpolate({
            inputRange: [0, 0.12, 0.78, 1],
            outputRange: [
              0,
              maxOpacity,
              maxOpacity * 0.7,
              0,
            ],
          });

          const rotate = spin.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "360deg"],
          });

          return (
            <Animated.View
              key={particle.id}
              style={[
                styles.icon,
                {
                  bottom: -size - 16,
                  left: particle.left,
                  opacity,
                  zIndex,
                  transform: spinEnabled
                    ? [
                        { translateX },
                        { translateY },
                        { rotate },
                      ]
                    : [
                        { translateX },
                        { translateY },
                      ],
                },
              ]}
            >
              <Icon
                color={
                  isBalloon
                    ? "#ef4444"
                    : color
                }
                size={size}
                strokeWidth={strokeWidth}
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