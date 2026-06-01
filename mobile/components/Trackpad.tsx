import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
} from "react-native-gesture-handler";
import { useTrackpadGestures } from "../gestures/useTrackpadGestures";

interface TrackpadProps {
  onMove: (dx: number, dy: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onRightClick: () => void;
  onScroll: (dx: number, dy: number) => void;
  onZoom: (direction: "in" | "out") => void;
  onSwipeSpaces: (direction: "left" | "right") => void;
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
    handleTwoPan,
    handleTwoPanState,
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
    onScroll,
    onZoom,
    onSwipeSpaces,
  });

  const singleTapRef = useRef(null);
  const doubleTapRef = useRef(null);
  const twoTapRef = useRef(null);
  const singlePanRef = useRef(null);
  const twoPanRef = useRef(null);
  const threePanRef = useRef(null);
  const pinchRef = useRef(null);

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
              simultaneousHandlers={twoPanRef}
              onGestureEvent={handlePinch}
              onHandlerStateChange={handlePinchState}
            >
              <PanGestureHandler
                ref={twoPanRef}
                minPointers={2}
                maxPointers={2}
                minDist={1}
                simultaneousHandlers={[pinchRef, twoTapRef]}
                onGestureEvent={handleTwoPan}
                onHandlerStateChange={handleTwoPanState}
              >
                <PanGestureHandler
                  ref={singlePanRef}
                  minPointers={1}
                  maxPointers={1}
                  minDist={1}
                  shouldCancelWhenOutside={false}
                  onGestureEvent={handleSinglePan}
                  onHandlerStateChange={handleSinglePanState}
                >
                  <View style={styles.trackpad}>
                    <View style={styles.centerMark}>
                      <Ionicons
                        name="ellipse-outline"
                        size={34}
                        color="#6f7a8c"
                      />
                      <Text style={styles.label}>Trackpad</Text>
                    </View>
                  </View>
                </PanGestureHandler>
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
    backgroundColor: "#12151b",
    borderColor: "#262c36",
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
  label: {
    color: "#8c96a7",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
});
