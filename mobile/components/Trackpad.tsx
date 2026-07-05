import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  PinchGestureHandler,
  State,
  TapGestureHandler,
} from "react-native-gesture-handler";
import { useTrackpadGestures } from "../gestures/useTrackpadGestures";
import { triggerLongPressHaptic } from "../utils/haptics";

interface TrackpadProps {
  onMove: (dx: number, dy: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onRightClick: () => void;
  onScroll: (dx: number, dy: number) => void;
  onZoom: (direction: "in" | "out") => void;
  onSwipeSpaces: (direction: "left" | "right") => void;
}

const SCROLL_DOT_RANGE = 20;
const SCROLL_DOT_SIZE = 50;
const SCROLL_DOT_MIN_FRAME_DELTA = 1.2;
const SCROLL_DOT_MAX_FRAME_DELTA = 26;
const SCROLL_DOT_MAX_SPEED_DISTANCE = 140;
const SCROLL_DOT_STORAGE_KEY = "remote-control:scroll-dot-position";
const SCROLL_DOT_LONG_PRESS_MS = 900;
const SCROLL_DOT_LONG_PRESS_MOVE_TOLERANCE = 8;
const SCROLL_DOT_EDGE_PADDING = 8;
const TRACKPAD_MARK_ICON_SIZE = 34;
const TRACKPAD_MARK_LABEL_LINE_HEIGHT = 16;
const TRACKPAD_TOUCH_MARK_ANIMATION_ENABLED = false;

interface ScrollDotPosition {
  left: number;
  top: number;
}

interface ScrollDotSavedPosition {
  xRatio: number;
  yRatio: number;
}

export function Trackpad({
  onMove,
  onClick,
  onDoubleClick,
  onRightClick,
  onScroll,
  onZoom,
  onSwipeSpaces,
}: TrackpadProps) {
  const {
    handleSinglePan,
    handleSinglePanState,
    handlePinch,
    handlePinchState,
    handleThreePanState,
    handleSingleTap,
    handleDoubleTap,
    handleTwoFingerTap,
  } = useTrackpadGestures({
    onMove,
    onClick,
    onDoubleClick,
    onRightClick,
    onZoom,
    onSwipeSpaces,
  });

  const singleTapRef = useRef(null);
  const doubleTapRef = useRef(null);
  const twoTapRef = useRef(null);
  const singlePanRef = useRef(null);
  const threePanRef = useRef(null);
  const pinchRef = useRef(null);
  const scrollDotPanRef = useRef(null);
  const scrollDotY = useRef(new Animated.Value(0)).current;
  const scrollDotSpeed = useRef(0);
  const scrollDotVisualY = useRef(0);
  const scrollDotFrame = useRef<number | null>(null);
  const scrollDotLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scrollDotLongPressEligible = useRef(false);
  const scrollDotLongPressMoved = useRef(false);
  const scrollDotLongPressStart = useRef<{ x: number; y: number } | null>(null);
  const scrollDotHomeRef = useRef<ScrollDotPosition | null>(null);
  const scrollDotDragStart = useRef<ScrollDotPosition | null>(null);
  const scrollDotSavedPosition = useRef<ScrollDotSavedPosition | null>(null);
  const scrollDotPlacementMode = useRef(false);
  const trackpadLayout = useRef({ width: 0, height: 0 });
  const touchMarkX = useRef(new Animated.Value(0)).current;
  const touchMarkY = useRef(new Animated.Value(0)).current;
  const [scrollDotActive, setScrollDotActive] = useState(false);
  const [scrollDotPlacing, setScrollDotPlacing] = useState(false);
  const [scrollDotHome, setScrollDotHome] =
    useState<ScrollDotPosition | null>(null);

  const resetTouchMark = useCallback(() => {
    if (!TRACKPAD_TOUCH_MARK_ANIMATION_ENABLED) {
      return;
    }

    touchMarkX.stopAnimation();
    touchMarkY.stopAnimation();
    Animated.parallel([
      Animated.spring(touchMarkX, {
        toValue: 0,
        tension: 170,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.spring(touchMarkY, {
        toValue: 0,
        tension: 170,
        friction: 16,
        useNativeDriver: true,
      }),
    ]).start();
  }, [touchMarkX, touchMarkY]);

  const moveTouchMark = useCallback(
    (x: number, y: number) => {
      if (!TRACKPAD_TOUCH_MARK_ANIMATION_ENABLED) {
        return;
      }

      const { width, height } = trackpadLayout.current;

      if (width <= 0 || height <= 0) {
        return;
      }

      const markHomeX = width / 2;
      const markHomeY = height / 2 - (10 + TRACKPAD_MARK_LABEL_LINE_HEIGHT) / 2;
      const nextX = x - markHomeX;
      const nextY = y - markHomeY;

      touchMarkX.stopAnimation();
      touchMarkY.stopAnimation();
      touchMarkX.setValue(nextX);
      touchMarkY.setValue(nextY);
    },
    [touchMarkX, touchMarkY],
  );

  const applyScrollDotHome = useCallback((position: ScrollDotPosition) => {
    scrollDotHomeRef.current = position;
    setScrollDotHome(position);
  }, []);

  const resolveScrollDotHome = useCallback(
    (
      width: number,
      height: number,
      savedPosition: ScrollDotSavedPosition | null,
    ): ScrollDotPosition => {
      if (savedPosition) {
        return clampScrollDotPosition(
          savedPosition.xRatio * width - SCROLL_DOT_SIZE / 2,
          savedPosition.yRatio * height - SCROLL_DOT_SIZE / 2,
          width,
          height,
        );
      }

      return clampScrollDotPosition(
        10,
        height / 2 - SCROLL_DOT_SIZE / 2,
        width,
        height,
      );
    },
    [],
  );

  const saveScrollDotHome = useCallback((position: ScrollDotPosition) => {
    const { width, height } = trackpadLayout.current;

    if (width <= 0 || height <= 0) {
      return;
    }

    const savedPosition = {
      xRatio: clamp((position.left + SCROLL_DOT_SIZE / 2) / width, 0, 1),
      yRatio: clamp((position.top + SCROLL_DOT_SIZE / 2) / height, 0, 1),
    };

    scrollDotSavedPosition.current = savedPosition;
    AsyncStorage.setItem(
      SCROLL_DOT_STORAGE_KEY,
      JSON.stringify(savedPosition),
    ).catch(() => {
      // Ignore persistence failures; the dot still works for this session.
    });
  }, []);

  const handleTrackpadLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;

      trackpadLayout.current = { width, height };
      applyScrollDotHome(
        resolveScrollDotHome(width, height, scrollDotSavedPosition.current),
      );
    },
    [applyScrollDotHome, resolveScrollDotHome],
  );

  const stopScrollDotLoop = useCallback(() => {
    if (scrollDotFrame.current !== null) {
      cancelAnimationFrame(scrollDotFrame.current);
      scrollDotFrame.current = null;
    }
  }, []);

  const clearScrollDotLongPressTimer = useCallback(() => {
    scrollDotLongPressEligible.current = false;
    scrollDotLongPressStart.current = null;

    if (scrollDotLongPressTimer.current !== null) {
      clearTimeout(scrollDotLongPressTimer.current);
      scrollDotLongPressTimer.current = null;
    }
  }, []);

  const runScrollDotLoop = useCallback(() => {
    const speed = scrollDotSpeed.current;
    const pressure = Math.abs(speed);

    if (pressure > 0) {
      const frameDelta =
        SCROLL_DOT_MIN_FRAME_DELTA +
        (SCROLL_DOT_MAX_FRAME_DELTA - SCROLL_DOT_MIN_FRAME_DELTA) *
          pressure *
          pressure;

      onScroll(0, Math.sign(speed) * frameDelta);
    }

    scrollDotFrame.current = requestAnimationFrame(runScrollDotLoop);
  }, [onScroll]);

  const startScrollDotLoop = useCallback(() => {
    if (scrollDotFrame.current === null) {
      scrollDotFrame.current = requestAnimationFrame(runScrollDotLoop);
    }
  }, [runScrollDotLoop]);

  useEffect(() => stopScrollDotLoop, [stopScrollDotLoop]);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(SCROLL_DOT_STORAGE_KEY)
      .then((value) => {
        if (!mounted || !value) {
          return;
        }

        const parsed = JSON.parse(value) as Partial<ScrollDotSavedPosition>;

        if (
          typeof parsed.xRatio !== "number" ||
          typeof parsed.yRatio !== "number" ||
          !Number.isFinite(parsed.xRatio) ||
          !Number.isFinite(parsed.yRatio)
        ) {
          return;
        }

        const savedPosition = {
          xRatio: clamp(parsed.xRatio, 0, 1),
          yRatio: clamp(parsed.yRatio, 0, 1),
        };
        const { width, height } = trackpadLayout.current;

        scrollDotSavedPosition.current = savedPosition;

        if (width > 0 && height > 0) {
          applyScrollDotHome(
            resolveScrollDotHome(width, height, savedPosition),
          );
        }
      })
      .catch(() => {
        // Keep the default position if saved data is unavailable.
      });

    return () => {
      mounted = false;
    };
  }, [applyScrollDotHome, resolveScrollDotHome]);

  useEffect(
    () => () => {
      clearScrollDotLongPressTimer();
      stopScrollDotLoop();
    },
    [clearScrollDotLongPressTimer, stopScrollDotLoop],
  );

  const animateScrollDotHome = useCallback(
    (onFinished?: () => void) => {
      const releaseY = scrollDotVisualY.current;
      const direction = Math.sign(releaseY);
      const rebound = direction === 0 ? 0 : -direction * 10;

      scrollDotY.stopAnimation();

      if (rebound === 0) {
        Animated.spring(scrollDotY, {
          toValue: 0,
          tension: 170,
          friction: 14,
          useNativeDriver: true,
        }).start(onFinished);
        return;
      }

      Animated.sequence([
        Animated.timing(scrollDotY, {
          toValue: 0,
          duration: 95,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scrollDotY, {
          toValue: rebound,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scrollDotY, {
          toValue: 0,
          tension: 150,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(onFinished);
    },
    [scrollDotY],
  );

  const handleScrollDotPan = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;

      if (scrollDotPlacementMode.current) {
        const { width, height } = trackpadLayout.current;
        const start = scrollDotDragStart.current;

        if (width > 0 && height > 0 && start) {
          const nextPosition = clampScrollDotPosition(
            start.left + translationX,
            start.top + translationY,
            width,
            height,
          );

          applyScrollDotHome(nextPosition);
        }

        scrollDotSpeed.current = 0;
        scrollDotVisualY.current = 0;
        scrollDotY.setValue(0);
        return;
      }

      if (hasScrollDotTouchMoved(translationX, translationY)) {
        scrollDotLongPressMoved.current = true;
        clearScrollDotLongPressTimer();
        startScrollDotLoop();
      }

      const clampedY = clamp(translationY, -SCROLL_DOT_RANGE, SCROLL_DOT_RANGE);
      const speed = clamp(translationY / SCROLL_DOT_MAX_SPEED_DISTANCE, -1, 1);

      scrollDotSpeed.current = speed;
      scrollDotVisualY.current = clampedY;
      scrollDotY.setValue(clampedY);
    },
    [
      applyScrollDotHome,
      clearScrollDotLongPressTimer,
      scrollDotY,
      startScrollDotLoop,
    ],
  );

  const handleScrollDotState = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const state = event.nativeEvent.state;

      if (state === State.BEGAN) {
        resetTouchMark();
        clearScrollDotLongPressTimer();
        scrollDotPlacementMode.current = false;
        scrollDotDragStart.current = scrollDotHomeRef.current;
        scrollDotSpeed.current = 0;
        scrollDotVisualY.current = 0;
        scrollDotY.stopAnimation();
        scrollDotY.setValue(0);
        setScrollDotPlacing(false);
        setScrollDotActive(true);
        scrollDotLongPressEligible.current = true;
        scrollDotLongPressMoved.current = false;
        scrollDotLongPressStart.current = {
          x: event.nativeEvent.x,
          y: event.nativeEvent.y,
        };
        scrollDotLongPressTimer.current = setTimeout(() => {
          scrollDotLongPressTimer.current = null;

          if (
            !scrollDotLongPressEligible.current ||
            scrollDotLongPressMoved.current
          ) {
            return;
          }

          scrollDotLongPressEligible.current = false;
          scrollDotLongPressMoved.current = false;
          scrollDotLongPressStart.current = null;
          scrollDotPlacementMode.current = true;
          scrollDotDragStart.current = scrollDotHomeRef.current;
          scrollDotSpeed.current = 0;
          scrollDotVisualY.current = 0;
          scrollDotY.stopAnimation();
          scrollDotY.setValue(0);
          stopScrollDotLoop();
          setScrollDotPlacing(true);
          triggerLongPressHaptic();
        }, SCROLL_DOT_LONG_PRESS_MS);
        return;
      }

      if (
        state === State.END ||
        state === State.CANCELLED ||
        state === State.FAILED ||
        event.nativeEvent.oldState === State.ACTIVE
      ) {
        const wasPlacing = scrollDotPlacementMode.current;
        const position = scrollDotHomeRef.current;

        clearScrollDotLongPressTimer();
        scrollDotPlacementMode.current = false;
        scrollDotDragStart.current = null;
        scrollDotSpeed.current = 0;
        scrollDotVisualY.current = 0;
        scrollDotY.setValue(0);
        setScrollDotPlacing(false);
        stopScrollDotLoop();

        if (wasPlacing) {
          setScrollDotActive(false);

          if (position) {
            saveScrollDotHome(position);
          }

          return;
        }

        animateScrollDotHome(() => {
          scrollDotVisualY.current = 0;
          setScrollDotActive(false);
        });
      }
    },
    [
      animateScrollDotHome,
      clearScrollDotLongPressTimer,
      resetTouchMark,
      saveScrollDotHome,
      scrollDotY,
      stopScrollDotLoop,
    ],
  );

  const handleTouchMarkSinglePan = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      handleSinglePan(event);
      moveTouchMark(event.nativeEvent.x, event.nativeEvent.y);
    },
    [handleSinglePan, moveTouchMark],
  );

  const handleTouchMarkSinglePanState = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      handleSinglePanState(event);

      if (event.nativeEvent.state === State.BEGAN) {
        moveTouchMark(event.nativeEvent.x, event.nativeEvent.y);
        return;
      }

      if (
        event.nativeEvent.state === State.END ||
        event.nativeEvent.state === State.CANCELLED ||
        event.nativeEvent.state === State.FAILED ||
        event.nativeEvent.oldState === State.ACTIVE
      ) {
        resetTouchMark();
      }
    },
    [handleSinglePanState, moveTouchMark, resetTouchMark],
  );

  const scrollDotPositionStyle = scrollDotHome
    ? {
        left: scrollDotHome.left,
        marginTop: 0,
        top: scrollDotHome.top,
      }
    : null;
  const scrollDotRailPositionStyle = scrollDotHome
    ? {
        left: scrollDotHome.left + SCROLL_DOT_SIZE / 2 - 15,
        marginTop: 0,
        top: scrollDotHome.top + SCROLL_DOT_SIZE / 2 - 59,
      }
    : null;

  return (
    <TapGestureHandler
      ref={singleTapRef}
      maxDurationMs={180}
      maxDeltaX={12}
      maxDeltaY={12}
      waitFor={[doubleTapRef, twoTapRef]}
      onHandlerStateChange={handleSingleTap}
    >
      <TapGestureHandler
        ref={doubleTapRef}
        numberOfTaps={2}
        maxDelayMs={260}
        maxDurationMs={180}
        maxDeltaX={14}
        maxDeltaY={14}
        onHandlerStateChange={handleDoubleTap}
      >
        <TapGestureHandler
          ref={twoTapRef}
          minPointers={2}
          maxDurationMs={220}
          maxDeltaX={16}
          maxDeltaY={16}
          onHandlerStateChange={handleTwoFingerTap}
        >
          <PanGestureHandler
            ref={threePanRef}
            minPointers={3}
            maxPointers={3}
            onHandlerStateChange={handleThreePanState}
          >
            <PinchGestureHandler
              ref={pinchRef}
              onGestureEvent={handlePinch}
              onHandlerStateChange={handlePinchState}
            >
              <PanGestureHandler
                ref={singlePanRef}
                minPointers={1}
                maxPointers={1}
                minDist={1}
                waitFor={scrollDotPanRef}
                shouldCancelWhenOutside={false}
                onGestureEvent={handleTouchMarkSinglePan}
                onHandlerStateChange={handleTouchMarkSinglePanState}
              >
                <View
                  style={styles.trackpad}
                  onLayout={handleTrackpadLayout}
                  onResponderRelease={resetTouchMark}
                  onResponderTerminate={resetTouchMark}
                  onTouchCancel={resetTouchMark}
                  onTouchEnd={resetTouchMark}
                >
                  <View
                    pointerEvents="none"
                    style={[styles.scrollDotRail, scrollDotRailPositionStyle]}
                  >
                    <View style={styles.scrollDotRailLine} />
                    <View style={styles.scrollDotRailTick} />
                  </View>
                  <PanGestureHandler
                    ref={scrollDotPanRef}
                    minPointers={1}
                    maxPointers={1}
                    minDist={0}
                    hitSlop={{ top: 18, right: 18, bottom: 18, left: 0 }}
                    shouldCancelWhenOutside={false}
                    onGestureEvent={handleScrollDotPan}
                    onHandlerStateChange={handleScrollDotState}
                  >
                    <Animated.View
                      style={[
                        styles.scrollDot,
                        scrollDotPositionStyle,
                        scrollDotActive ? styles.scrollDotActive : null,
                        scrollDotPlacing ? styles.scrollDotPlacing : null,
                        { transform: [{ translateY: scrollDotY }] },
                      ]}
                    >
                      <View
                        style={[
                          styles.scrollDotFace,
                          scrollDotActive ? styles.scrollDotFaceActive : null,
                          scrollDotPlacing
                            ? styles.scrollDotFacePlacing
                            : null,
                        ]}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={13}
                          color={scrollDotActive ? "#ffffff" : "#c7bdb1"}
                        />
                        <View
                          style={[
                            styles.scrollDotGrip,
                            scrollDotActive
                              ? styles.scrollDotGripActive
                              : null,
                          ]}
                        >
                          <View style={styles.scrollDotGripLine} />
                          <View style={styles.scrollDotGripLine} />
                          <View style={styles.scrollDotGripLine} />
                        </View>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={scrollDotActive ? "#ffffff" : "#c7bdb1"}
                        />
                      </View>
                    </Animated.View>
                  </PanGestureHandler>
                  {/* {scrollDotActive ? (
                    <View pointerEvents="none" style={styles.scrollCursor}>
                      <Ionicons name="caret-up" size={15} color="#e9eef8" />
                      <View style={styles.scrollCursorDot} />
                      <Ionicons name="caret-down" size={15} color="#e9eef8" />
                    </View>
                  ) : null} */}
                  <View style={styles.centerMark}>
                    <Animated.View
                      style={[
                        styles.touchMark,
                        {
                          transform: [
                            { translateX: touchMarkX },
                            { translateY: touchMarkY },
                          ],
                        },
                      ]}
                    >
                      <Ionicons
                        name="ellipse-outline"
                        size={TRACKPAD_MARK_ICON_SIZE}
                        color="#756f68"
                      />
                    </Animated.View>
                    <Text style={styles.label}>Trackpad</Text>
                  </View>
                </View>
              </PanGestureHandler>
            </PinchGestureHandler>
          </PanGestureHandler>
        </TapGestureHandler>
      </TapGestureHandler>
    </TapGestureHandler>
  );
}

const styles = StyleSheet.create({
  trackpad: {
    alignItems: "center",
    backgroundColor: "#11100e",
    borderColor: "#2a2118",
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  centerMark: {
    alignItems: "center",
    gap: 10,
    opacity: 0.62,
  },
  touchMark: {
    height: TRACKPAD_MARK_ICON_SIZE,
    width: TRACKPAD_MARK_ICON_SIZE,
  },
  label: {
    color: "#8f8982",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: TRACKPAD_MARK_LABEL_LINE_HEIGHT,
    textTransform: "uppercase",
  },
  scrollDot: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#4a3727",
    borderRadius: SCROLL_DOT_SIZE / 2,
    borderWidth: 1,
    height: SCROLL_DOT_SIZE,
    justifyContent: "center",
    left: 10,
    marginTop: -SCROLL_DOT_SIZE / 2,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    top: "50%",
    width: SCROLL_DOT_SIZE,
    zIndex: 2,
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
    borderRadius: (SCROLL_DOT_SIZE - 10) / 2,
    borderWidth: 1,
    height: SCROLL_DOT_SIZE - 10,
    justifyContent: "center",
    width: SCROLL_DOT_SIZE - 10,
  },
  scrollDotFaceActive: {
    backgroundColor: "#5c3820",
    borderColor: "#ff941f",
  },
  scrollDotFacePlacing: {
    backgroundColor: "#2c1b10",
    borderColor: "#ffb347",
  },
  scrollDotGrip: {
    alignItems: "center",
    gap: 2,
    justifyContent: "center",
    marginVertical: -1,
  },
  scrollDotGripActive: {
    opacity: 0.95,
  },
  scrollDotGripLine: {
    backgroundColor: "#c7bdb1",
    borderRadius: 1,
    height: 2,
    width: 12,
  },
  scrollDotRail: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    borderWidth: 1,
    height: 118,
    justifyContent: "center",
    left: 20,
    marginTop: -59,
    position: "absolute",
    top: "50%",
    width: 30,
    zIndex: 1,
  },
  scrollDotRailLine: {
    backgroundColor: "#33261b",
    borderRadius: 2,
    height: 82,
    width: 4,
  },
  scrollDotRailTick: {
    backgroundColor: "#756f68",
    borderRadius: 2,
    height: 4,
    position: "absolute",
    width: 14,
  },
  scrollCursor: {
    alignItems: "center",
    backgroundColor: "rgba(13, 16, 22, 0.86)",
    borderColor: "#f4eee7",
    borderRadius: 17,
    borderWidth: 1,
    gap: 1,
    height: 58,
    justifyContent: "center",
    left: 52,
    marginTop: -29,
    position: "absolute",
    top: "50%",
    width: 34,
    zIndex: 1,
  },
  scrollCursorDot: {
    backgroundColor: "#f4eee7",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasScrollDotTouchMoved(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > SCROLL_DOT_LONG_PRESS_MOVE_TOLERANCE;
}

function clampScrollDotPosition(
  left: number,
  top: number,
  width: number,
  height: number,
): ScrollDotPosition {
  const maxLeft = Math.max(
    SCROLL_DOT_EDGE_PADDING,
    width - SCROLL_DOT_SIZE - SCROLL_DOT_EDGE_PADDING,
  );
  const maxTop = Math.max(
    SCROLL_DOT_EDGE_PADDING,
    height - SCROLL_DOT_SIZE - SCROLL_DOT_EDGE_PADDING,
  );

  return {
    left: clamp(left, SCROLL_DOT_EDGE_PADDING, maxLeft),
    top: clamp(top, SCROLL_DOT_EDGE_PADDING, maxTop),
  };
}
