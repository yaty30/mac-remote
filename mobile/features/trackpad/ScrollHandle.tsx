import { Ionicons } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export const SCROLL_HANDLE_SIZE = 62;

interface ScrollHandleProps {
  active: boolean;
  placing: boolean;
  positionStyle: StyleProp<ViewStyle>;
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
}

export const ScrollHandle = forwardRef<View, ScrollHandleProps>(
  (
    {
      active,
      placing,
      positionStyle,
      scale,
      translateX,
      translateY,
    },
    ref,
  ) => (
    <Animated.View
      ref={ref}
      collapsable={false}
      style={[styles.scrollDot, positionStyle]}
    >
      <Animated.View
        style={[
          styles.scrollDotInner,
          active ? styles.scrollDotActive : null,
          placing ? styles.scrollDotPlacing : null,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.scrollDotFace,
            active ? styles.scrollDotFaceActive : null,
            placing ? styles.scrollDotFacePlacing : null,
          ]}
        >
          <View style={styles.scrollDotAxisVertical} />
          <View style={styles.scrollDotAxisHorizontal} />
          <Ionicons
            name="chevron-up"
            size={15}
            color={active ? "#ffffff" : "#c7bdb1"}
            style={styles.scrollDotChevronUp}
          />
          <Ionicons
            name="chevron-back"
            size={15}
            color={active ? "#ffffff" : "#c7bdb1"}
            style={styles.scrollDotChevronLeft}
          />
          <View style={styles.scrollDotCenter} />
          <Ionicons
            name="chevron-forward"
            size={15}
            color={active ? "#ffffff" : "#c7bdb1"}
            style={styles.scrollDotChevronRight}
          />
          <Ionicons
            name="chevron-down"
            size={15}
            color={active ? "#ffffff" : "#c7bdb1"}
            style={styles.scrollDotChevronDown}
          />
        </View>
      </Animated.View>
    </Animated.View>
  ),
);

const styles = StyleSheet.create({
  scrollDot: {
    alignItems: "center",
    height: SCROLL_HANDLE_SIZE,
    justifyContent: "center",
    left: 10,
    marginTop: -SCROLL_HANDLE_SIZE / 2,
    position: "absolute",
    top: "50%",
    width: SCROLL_HANDLE_SIZE,
    zIndex: 2,
  },
  scrollDotInner: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#744c2c",
    borderRadius: SCROLL_HANDLE_SIZE / 2,
    borderWidth: 1,
    height: SCROLL_HANDLE_SIZE,
    justifyContent: "center",
    shadowColor: "#413028",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.44,
    shadowRadius: 22,
    width: SCROLL_HANDLE_SIZE,
  },
  scrollDotActive: {
    backgroundColor: "#3a2617",
    borderColor: "#ff941f",
  },
  scrollDotPlacing: {
    backgroundColor: "#3a2617",
    borderColor: "#ffb347",
    shadowOpacity: 0.44,
  },
  scrollDotFace: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#33261b",
    borderRadius: (SCROLL_HANDLE_SIZE - 10) / 2,
    borderWidth: 1,
    height: SCROLL_HANDLE_SIZE - 10,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: SCROLL_HANDLE_SIZE - 10,
  },
  scrollDotFaceActive: {
    backgroundColor: "#5c3820",
    borderColor: "#ff931f",
  },
  scrollDotFacePlacing: {
    backgroundColor: "#2c1b103e",
    borderColor: "#ffb2479e",
  },
  scrollDotAxisVertical: {
    backgroundColor: "rgba(199, 189, 177, 0.26)",
    borderRadius: 4,
    height: 44,
    position: "absolute",
    width: 8,
  },
  scrollDotAxisHorizontal: {
    backgroundColor: "rgba(199, 189, 177, 0.26)",
    borderRadius: 4,
    height: 8,
    position: "absolute",
    width: 44,
  },
  scrollDotCenter: {
    backgroundColor: "#c7bdb1",
    borderColor: "rgba(13, 13, 13, 0.72)",
    borderRadius: 7,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    width: 12,
  },
  scrollDotChevronUp: {
    color: "#f4eee788",
    position: "absolute",
    top: 4,
  },
  scrollDotChevronDown: {
    bottom: 4,
    color: "#f4eee788",
    position: "absolute",
  },
  scrollDotChevronLeft: {
    color: "#f4eee788",
    left: 4,
    position: "absolute",
  },
  scrollDotChevronRight: {
    color: "#f4eee788",
    position: "absolute",
    right: 4,
  },
});
