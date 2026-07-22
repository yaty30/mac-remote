import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

const CONNECTION_CANCEL_DELAY_MS = 3000;

interface UseConnectionOverlayParams {
  deviceSwitchOverlayMounted: boolean;
  status: string;
}

export function useConnectionOverlay({
  deviceSwitchOverlayMounted,
  status,
}: UseConnectionOverlayParams) {
  const connectionCancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const connectionSpinnerAnim = useRef(new Animated.Value(0)).current;
  const connectionCancelAnim = useRef(new Animated.Value(0)).current;
  const [connectionCancelVisible, setConnectionCancelVisible] = useState(false);
  const connectionInProgress = status === "connecting";

  function resetConnectionCancelButton() {
    setConnectionCancelVisible(false);
    connectionCancelAnim.stopAnimation();
    connectionCancelAnim.setValue(0);
  }

  useEffect(() => {
    if (status !== "connecting" || deviceSwitchOverlayMounted) {
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
      resetConnectionCancelButton();
      return;
    }

    connectionCancelTimerRef.current = setTimeout(() => {
      connectionCancelTimerRef.current = null;
      setConnectionCancelVisible(true);
      connectionCancelAnim.setValue(0);
      Animated.timing(connectionCancelAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, CONNECTION_CANCEL_DELAY_MS);

    return () => {
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
    };
  }, [connectionCancelAnim, deviceSwitchOverlayMounted, status]);

  useEffect(() => {
    if (!connectionInProgress || deviceSwitchOverlayMounted) {
      connectionSpinnerAnim.stopAnimation();
      connectionSpinnerAnim.setValue(0);
      return;
    }

    connectionSpinnerAnim.setValue(0);
    const spinnerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(connectionSpinnerAnim, {
          toValue: 0.5,
          duration: 820,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(connectionSpinnerAnim, {
          toValue: 1,
          duration: 860,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    spinnerAnimation.start();

    return () => {
      spinnerAnimation.stop();
    };
  }, [
    connectionInProgress,
    connectionSpinnerAnim,
    deviceSwitchOverlayMounted,
  ]);

  useEffect(
    () => () => {
      if (connectionCancelTimerRef.current !== null) {
        clearTimeout(connectionCancelTimerRef.current);
        connectionCancelTimerRef.current = null;
      }
    },
    [],
  );

  const connectionSpinnerAnimatedStyle = {
    transform: [
      {
        rotate: connectionSpinnerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };

  const connectionCancelAnimatedStyle = {
    maxHeight: connectionCancelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 42],
    }),
    opacity: connectionCancelAnim,
    transform: [
      {
        scale: connectionCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1],
        }),
      },
      {
        translateY: connectionCancelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }),
      },
    ],
  };

  return {
    connectionCancelAnimatedStyle,
    connectionCancelVisible,
    connectionInProgress,
    connectionSpinnerAnimatedStyle,
  };
}
