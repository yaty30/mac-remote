import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Platform } from "react-native";

const KEYBOARD_PANEL_KEYBOARD_GAP = 12;
const KEYBOARD_PANEL_TOP = 106;
const KEYBOARD_PANEL_RESTING_BOTTOM = 112;

interface UseKeyboardPanelAnimationParams {
  keyboardHeight: number;
  keyboardOverlay: boolean;
  screenLayoutHeight: number;
  windowHeight: number;
}

export function useKeyboardPanelAnimation({
  keyboardHeight,
  keyboardOverlay,
  screenLayoutHeight,
  windowHeight,
}: UseKeyboardPanelAnimationParams) {
  const fullScreenLayoutHeightRef = useRef(windowHeight);
  const keyboardPanelAnim = useRef(new Animated.Value(0)).current;
  const [keyboardUiMounted, setKeyboardUiMounted] = useState(false);

  useEffect(() => {
    if (keyboardOverlay) {
      return;
    }

    fullScreenLayoutHeightRef.current = Math.max(
      fullScreenLayoutHeightRef.current,
      screenLayoutHeight,
      windowHeight,
    );
  }, [keyboardOverlay, screenLayoutHeight, windowHeight]);

  useEffect(() => {
    if (keyboardOverlay) {
      setKeyboardUiMounted(true);
      keyboardPanelAnim.setValue(0);
      Animated.timing(keyboardPanelAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(keyboardPanelAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setKeyboardUiMounted(false);
      }
    });
  }, [keyboardOverlay, keyboardPanelAnim]);

  const androidKeyboardPanelTop = clamp(Math.round(windowHeight * 0.08), 54, 76);
  const androidKeyboardPanelGap = clamp(Math.round(windowHeight * 0.09), 56, 82);
  const currentWindowHeight = Dimensions.get("window").height;
  const androidWindowShrinkInset =
    keyboardOverlay && Platform.OS === "android"
      ? Math.max(0, fullScreenLayoutHeightRef.current - currentWindowHeight)
      : 0;
  const androidParentAlreadyResized =
    keyboardOverlay &&
    Platform.OS === "android" &&
    screenLayoutHeight < fullScreenLayoutHeightRef.current - 48;
  const keyboardPanelInset =
    keyboardOverlay &&
    Platform.OS === "android" &&
    !androidParentAlreadyResized
      ? Math.max(keyboardHeight, androidWindowShrinkInset)
      : keyboardHeight;
  const keyboardPanelTop =
    keyboardOverlay && Platform.OS === "android"
      ? androidKeyboardPanelTop
      : KEYBOARD_PANEL_TOP;
  const keyboardPanelKeyboardGap =
    keyboardOverlay && Platform.OS === "android"
      ? androidKeyboardPanelGap
      : KEYBOARD_PANEL_KEYBOARD_GAP;
  const keyboardPanelBottom = keyboardOverlay
    ? keyboardPanelInset + keyboardPanelKeyboardGap
    : KEYBOARD_PANEL_RESTING_BOTTOM;

  return {
    keyboardBackdropAnimatedStyle: {
      opacity: keyboardPanelAnim,
    },
    keyboardPanelAnimatedStyle: {
      opacity: keyboardPanelAnim,
      transform: [
        {
          translateY: keyboardPanelAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [22, 0],
          }),
        },
        {
          scale: keyboardPanelAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.98, 1],
          }),
        },
      ],
    },
    keyboardPanelDynamicStyle: {
      bottom: keyboardPanelBottom,
      top: keyboardPanelTop,
    },
    keyboardUiMounted,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
