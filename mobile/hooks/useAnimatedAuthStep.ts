import { useEffect, useRef, useState } from "react";
import {
  Animated,
  type ViewStyle,
} from "react-native";

interface TransitionOptions {
  afterChange?: () => void;
  beforeChange?: () => void;
}

export function useAnimatedAuthStep<Step extends string>(initialStep: Step) {
  const [step, setStep] = useState<Step>(initialStep);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const stepAnimation = useRef(new Animated.Value(1)).current;
  const stepRef = useRef(initialStep);
  const isMountedRef = useRef(true);
  const isTransitioningRef = useRef(false);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      stepAnimation.stopAnimation();
    },
    [stepAnimation],
  );

  const transitionTo = (
    nextStep: Step,
    options: TransitionOptions = {},
  ) => {
    if (
      nextStep === stepRef.current ||
      isTransitioningRef.current ||
      !isMountedRef.current
    ) {
      return false;
    }

    isTransitioningRef.current = true;
    setIsTransitioning(true);
    stepAnimation.stopAnimation();

    Animated.timing(stepAnimation, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !isMountedRef.current) {
        isTransitioningRef.current = false;
        if (isMountedRef.current) {
          setIsTransitioning(false);
        }
        return;
      }

      options.beforeChange?.();
      stepRef.current = nextStep;
      stepAnimation.setValue(0);
      setStep(nextStep);

      Animated.timing(stepAnimation, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start(({ finished: enterFinished }) => {
        if (!enterFinished || !isMountedRef.current) {
          return;
        }

        options.afterChange?.();
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      });
    });

    return true;
  };

  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: stepAnimation,
    transform: [
      {
        translateY: stepAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
      {
        scale: stepAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };

  return {
    animatedStyle,
    isTransitioning,
    isTransitioningRef,
    step,
    stepAnimation,
    stepRef,
    transitionTo,
  };
}
