import { useCallback, useRef } from "react";
import type {
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandlerGestureEvent,
  PinchGestureHandlerStateChangeEvent,
  TapGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { State } from "react-native-gesture-handler";

interface TrackpadHandlers {
  onMove: (dx: number, dy: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onRightClick: () => void;
  onScroll: (dx: number, dy: number) => void;
  onZoom: (direction: "in" | "out") => void;
  onSwipeSpaces: (direction: "left" | "right") => void;
}

const ZOOM_RATIO_THRESHOLD = 1.18;
const SWIPE_DISTANCE = 60;
const SCROLL_SENSITIVITY = 3.2;

export function useTrackpadGestures({
  onMove,
  onClick,
  onDoubleClick,
  onRightClick,
  onScroll,
  onZoom,
  onSwipeSpaces,
}: TrackpadHandlers) {
  const lastSinglePan = useRef({ x: 0, y: 0 });
  const lastTwoPan = useRef({ x: 0, y: 0 });
  const pinchAnchor = useRef(1);

  const handleSinglePan = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;
      const dx = translationX - lastSinglePan.current.x;
      const dy = translationY - lastSinglePan.current.y;

      lastSinglePan.current = { x: translationX, y: translationY };

      if (dx !== 0 || dy !== 0) {
        onMove(dx, dy);
      }
    },
    [onMove],
  );

  const handleSinglePanState = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (
        event.nativeEvent.state === State.BEGAN ||
        event.nativeEvent.state === State.END ||
        event.nativeEvent.state === State.CANCELLED ||
        event.nativeEvent.state === State.FAILED
      ) {
        lastSinglePan.current = { x: 0, y: 0 };
      }
    },
    [],
  );

  const handleTwoPan = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;
      const dx = translationX - lastTwoPan.current.x;
      const dy = translationY - lastTwoPan.current.y;

      lastTwoPan.current = { x: translationX, y: translationY };

      if (dx !== 0 || dy !== 0) {
        onScroll(dx * SCROLL_SENSITIVITY, dy * SCROLL_SENSITIVITY);
      }
    },
    [onScroll],
  );

  const handleTwoPanState = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const state = event.nativeEvent.state;

      if (state === State.BEGAN) {
        lastTwoPan.current = { x: 0, y: 0 };
        return;
      }

      if (state === State.END) {
        lastTwoPan.current = { x: 0, y: 0 };
        return;
      }

      if (state === State.CANCELLED || state === State.FAILED) {
        lastTwoPan.current = { x: 0, y: 0 };
      }
    },
    [],
  );

  const handlePinch = useCallback(
    (event: PinchGestureHandlerGestureEvent) => {
      const { scale } = event.nativeEvent;
      const ratio = scale / pinchAnchor.current;

      if (ratio >= ZOOM_RATIO_THRESHOLD) {
        onZoom("in");
        pinchAnchor.current = scale;
      } else if (ratio <= 1 / ZOOM_RATIO_THRESHOLD) {
        onZoom("out");
        pinchAnchor.current = scale;
      }
    },
    [onZoom],
  );

  const handlePinchState = useCallback(
    (event: PinchGestureHandlerStateChangeEvent) => {
      if (
        event.nativeEvent.state === State.BEGAN ||
        event.nativeEvent.state === State.END ||
        event.nativeEvent.state === State.CANCELLED ||
        event.nativeEvent.state === State.FAILED
      ) {
        pinchAnchor.current = 1;
      }
    },
    [],
  );

  const handleThreePanState = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state !== State.END) {
        return;
      }

      const { translationX, translationY } = event.nativeEvent;

      if (
        Math.abs(translationX) > SWIPE_DISTANCE &&
        Math.abs(translationX) > Math.abs(translationY)
      ) {
        onSwipeSpaces(translationX > 0 ? "left" : "right");
      }
    },
    [onSwipeSpaces],
  );

  const handleSingleTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.ACTIVE) {
        onClick();
      }
    },
    [onClick],
  );

  const handleDoubleTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.ACTIVE) {
        onDoubleClick();
      }
    },
    [onDoubleClick],
  );

  const handleTwoFingerTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.ACTIVE) {
        onRightClick();
      }
    },
    [onRightClick],
  );

  return {
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
  };
}
