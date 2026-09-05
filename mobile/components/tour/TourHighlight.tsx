import { Animated, StyleSheet, View } from "react-native";
import type { TourTargetBounds } from "./tourTypes";

interface TourHighlightProps {
  animatedBounds: {
    height: Animated.Value;
    width: Animated.Value;
    x: Animated.Value;
    y: Animated.Value;
  };
  bounds: TourTargetBounds | null;
}

const HIGHLIGHT_PADDING = 8;

export function TourHighlight({ animatedBounds, bounds }: TourHighlightProps) {
  if (!bounds) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.highlight,
        {
          height: animatedBounds.height,
          left: animatedBounds.x,
          top: animatedBounds.y,
          width: animatedBounds.width,
        },
      ]}
    >
      <View style={styles.innerGlow} />
    </Animated.View>
  );
}

export function expandBounds(bounds: TourTargetBounds): TourTargetBounds {
  return {
    height: bounds.height + HIGHLIGHT_PADDING * 2,
    width: bounds.width + HIGHLIGHT_PADDING * 2,
    x: bounds.x - HIGHLIGHT_PADDING,
    y: bounds.y - HIGHLIGHT_PADDING,
  };
}

const styles = StyleSheet.create({
  highlight: {
    borderColor: "rgba(240, 169, 66, 0.95)",
    borderRadius: 18,
    borderWidth: 1.5,
    elevation: 24,
    position: "absolute",
    shadowColor: "#f0a942",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 18,
  },
  innerGlow: {
    // borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 16,
    borderWidth: 1,
    bottom: 3,
    left: 3,
    position: "absolute",
    right: 3,
    top: 3,
  },
});
