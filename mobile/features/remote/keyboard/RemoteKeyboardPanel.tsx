import type { ReactNode } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { RemoteKeyboardHeader } from "./RemoteKeyboardToolbar";

const BODY_HORIZONTAL_PADDING = 10;
const KEYBOARD_PANEL_TOP = 106;

interface RemoteKeyboardPanelProps {
  backdropAnimatedStyle: object;
  children: ReactNode;
  dynamicStyle: object;
  onClose: () => void;
  panelAnimatedStyle: object;
  uiMounted: boolean;
}

export function RemoteKeyboardPanel({
  backdropAnimatedStyle,
  children,
  dynamicStyle,
  onClose,
  panelAnimatedStyle,
  uiMounted,
}: RemoteKeyboardPanelProps) {
  return (
    <>
      {uiMounted ? (
        <Animated.View style={[styles.keyboardBg, backdropAnimatedStyle]}>
          <Pressable style={styles.keyboardBgPressable} onPress={onClose} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.keyboardPanel,
          uiMounted ? null : styles.keyboardPanelHidden,
          dynamicStyle,
          panelAnimatedStyle,
        ]}
        pointerEvents={uiMounted ? "auto" : "none"}
      >
        <RemoteKeyboardHeader onClose={onClose} />
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardBg: {
    backgroundColor: "rgba(7, 7, 7, 0.82)",
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
    zIndex: 999,
  },
  keyboardBgPressable: {
    flex: 1,
  },
  keyboardPanel: {
    backgroundColor: "rgba(18, 17, 15, 0.94)",
    borderColor: "rgba(240, 169, 66, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 18,
    gap: 14,
    left: BODY_HORIZONTAL_PADDING,
    padding: 14,
    position: "absolute",
    right: BODY_HORIZONTAL_PADDING,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.46,
    shadowRadius: 28,
    top: KEYBOARD_PANEL_TOP,
    zIndex: 1000,
  },
  keyboardPanelHidden: {
    opacity: 0,
  },
});
