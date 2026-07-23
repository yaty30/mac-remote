import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TourHighlight, expandBounds } from "./TourHighlight";
import { TourTooltip } from "./TourTooltip";
import type { TourPlacement, TourStep, TourTargetBounds } from "./tourTypes";

interface TourOverlayProps {
  activeStep?: TourStep;
  currentStep: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isVisible: boolean;
  measureTourTarget: (targetKey?: string) => Promise<TourTargetBounds | null>;
  onComplete: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  stepReadyVersion: number;
  totalSteps: number;
}

const TOOLTIP_MARGIN = 14;
const TOOLTIP_MAX_WIDTH = 340;
const TOOLTIP_ESTIMATED_HEIGHT = 274;
const OVERLAY_COLOR = "rgba(0, 0, 0, 0.68)";

export function TourOverlay({
  activeStep,
  currentStep,
  isFirstStep,
  isLastStep,
  isVisible,
  measureTourTarget,
  onComplete,
  onNext,
  onPrevious,
  onSkip,
  stepReadyVersion,
  totalSteps,
}: TourOverlayProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = Dimensions.get("window");
  const activeStepId = activeStep?.id;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipTranslateY = useRef(new Animated.Value(8)).current;
  const highlightX = useRef(new Animated.Value(windowWidth / 2)).current;
  const highlightY = useRef(new Animated.Value(windowHeight / 2)).current;
  const highlightWidth = useRef(new Animated.Value(0)).current;
  const highlightHeight = useRef(new Animated.Value(0)).current;
  const [targetBounds, setTargetBounds] = useState<TourTargetBounds | null>(
    null,
  );
  const [visibleStep, setVisibleStep] = useState<TourStep | undefined>();
  const [visibleStepIndex, setVisibleStepIndex] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(TOOLTIP_ESTIMATED_HEIGHT);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const renderedStep = visibleStep ?? activeStep;
  const renderedStepIndex = visibleStep ? visibleStepIndex : currentStep;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    setVisibleStep(undefined);
    setTargetBounds(null);
    tooltipOpacity.setValue(0);
    tooltipTranslateY.setValue(8);
  }, [isVisible, tooltipOpacity, tooltipTranslateY]);

  useEffect(() => {
    if (!isVisible || !activeStep) {
      return;
    }

    let cancelled = false;

    const runTransition = async () => {
      await animateTooltipOut(tooltipOpacity, tooltipTranslateY);

      const measured = activeStep.targetRef?.current
        ? await measureRef(activeStep.targetRef)
        : await measureTourTarget(activeStep.targetKey);

      if (cancelled) {
        return;
      }

      const nextBounds = measured ? expandBounds(measured) : null;
      setTargetBounds(nextBounds);
      setVisibleStep(activeStep);
      setVisibleStepIndex(currentStep);

      if (nextBounds) {
        Animated.parallel([
          Animated.timing(highlightX, {
            duration: 150,
            easing: Easing.inOut(Easing.cubic),
            toValue: nextBounds.x,
            useNativeDriver: false,
          }),
          Animated.timing(highlightY, {
            duration: 150,
            easing: Easing.inOut(Easing.cubic),
            toValue: nextBounds.y,
            useNativeDriver: false,
          }),
          Animated.timing(highlightWidth, {
            duration: 150,
            easing: Easing.inOut(Easing.cubic),
            toValue: nextBounds.width,
            useNativeDriver: false,
          }),
          Animated.timing(highlightHeight, {
            duration: 150,
            easing: Easing.inOut(Easing.cubic),
            toValue: nextBounds.height,
            useNativeDriver: false,
          }),
        ]).start();
      }

      Animated.parallel([
        Animated.timing(tooltipOpacity, {
          duration: 110,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(tooltipTranslateY, {
          duration: 110,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();

      AccessibilityInfo.announceForAccessibility(
        `Tour step ${currentStep + 1} of ${totalSteps}. ${activeStep.title}.`,
      );
    };

    const timeout = setTimeout(runTransition, 20);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    activeStepId,
    currentStep,
    highlightHeight,
    highlightWidth,
    highlightX,
    highlightY,
    isVisible,
    measureTourTarget,
    stepReadyVersion,
    tooltipOpacity,
    tooltipTranslateY,
    totalSteps,
  ]);

  const tooltipWidth = Math.min(
    TOOLTIP_MAX_WIDTH,
    windowWidth - insets.left - insets.right - TOOLTIP_MARGIN * 2,
  );
  const tooltipPosition = useMemo(
    () =>
      resolveTooltipPosition({
        insets,
        keyboardHeight,
        placement: renderedStep?.placement,
        targetBounds,
        tooltipHeight,
        tooltipWidth,
        windowHeight,
        windowWidth,
      }),
    [
      insets,
      keyboardHeight,
      renderedStep?.placement,
      targetBounds,
      tooltipHeight,
      tooltipWidth,
      windowHeight,
      windowWidth,
    ],
  );

  if (!isVisible || !renderedStep) {
    return null;
  }

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible>
      <View style={styles.root} pointerEvents="box-none">
        <DimmedBackdrop bounds={targetBounds} />
        <TourHighlight
          animatedBounds={{
            height: highlightHeight,
            width: highlightWidth,
            x: highlightX,
            y: highlightY,
          }}
          bounds={targetBounds}
        />
        {tooltipPosition.arrow ? (
          <View
            pointerEvents="none"
            style={[styles.arrow, tooltipPosition.arrow]}
          />
        ) : null}
        <TourTooltip
          animatedStyle={{
            left: tooltipPosition.left,
            opacity: tooltipOpacity,
            top: tooltipPosition.top,
            transform: [{ translateY: tooltipTranslateY }],
            width: tooltipWidth,
          }}
          currentStep={renderedStepIndex}
          isFirstStep={renderedStepIndex === 0}
          isLastStep={renderedStepIndex === totalSteps - 1}
          onComplete={onComplete}
          onLayout={setTooltipHeight}
          onNext={onNext}
          onPrevious={onPrevious}
          onSkip={onSkip}
          step={renderedStep}
          totalSteps={totalSteps}
        />
      </View>
    </Modal>
  );
}

function animateTooltipOut(
  opacity: Animated.Value,
  translateY: Animated.Value,
): Promise<void> {
  return new Promise((resolve) => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 45,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 45,
        easing: Easing.out(Easing.cubic),
        toValue: 8,
        useNativeDriver: true,
      }),
    ]).start(() => resolve());
  });
}

function DimmedBackdrop({ bounds }: { bounds: TourTargetBounds | null }) {
  const { height, width } = Dimensions.get("window");

  if (!bounds) {
    return <View pointerEvents="auto" style={styles.fullBackdrop} />;
  }

  const top = Math.max(0, bounds.y);
  const left = Math.max(0, bounds.x);
  const right = Math.max(0, width - bounds.x - bounds.width);
  const bottom = Math.max(0, height - bounds.y - bounds.height);

  return (
    <>
      <View
        pointerEvents="auto"
        style={[styles.backdropSlice, { height: top, left: 0, right: 0, top: 0 }]}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.backdropSlice,
          { bottom: bottom, left: 0, top, width: left },
        ]}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.backdropSlice,
          { bottom: bottom, right: 0, top, width: right },
        ]}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.backdropSlice,
          { bottom: 0, height: bottom, left: 0, right: 0 },
        ]}
      />
    </>
  );
}

async function measureRef(
  targetRef: RefObject<View | null>,
): Promise<TourTargetBounds | null> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }

        resolve({ height, width, x, y });
      });
    });
  });
}

function resolveTooltipPosition(input: {
  insets: { bottom: number; left: number; right: number; top: number };
  keyboardHeight: number;
  placement?: TourPlacement;
  targetBounds: TourTargetBounds | null;
  tooltipHeight: number;
  tooltipWidth: number;
  windowHeight: number;
  windowWidth: number;
}) {
  const {
    insets,
    keyboardHeight,
    placement,
    targetBounds,
    tooltipHeight,
    tooltipWidth,
    windowHeight,
    windowWidth,
  } = input;
  const safeLeft = insets.left + TOOLTIP_MARGIN;
  const safeRight = windowWidth - insets.right - TOOLTIP_MARGIN;
  const safeTop = insets.top + (Platform.OS === "android" ? 18 : 8);
  const safeBottom =
    windowHeight - Math.max(insets.bottom, keyboardHeight) - TOOLTIP_MARGIN;
  const centeredLeft = clamp(
    (windowWidth - tooltipWidth) / 2,
    safeLeft,
    safeRight - tooltipWidth,
  );
  const centeredTop = clamp(
    (windowHeight - tooltipHeight) / 2,
    safeTop,
    safeBottom - tooltipHeight,
  );

  if (!targetBounds || placement === "center") {
    return {
      arrow: null,
      left: centeredLeft,
      top: centeredTop,
    };
  }

  const belowTop = targetBounds.y + targetBounds.height + TOOLTIP_MARGIN;
  const aboveTop = targetBounds.y - tooltipHeight - TOOLTIP_MARGIN;
  const sideTop = clamp(
    targetBounds.y + targetBounds.height / 2 - tooltipHeight / 2,
    safeTop,
    safeBottom - tooltipHeight,
  );
  const horizontalLeft = clamp(
    targetBounds.x + targetBounds.width / 2 - tooltipWidth / 2,
    safeLeft,
    safeRight - tooltipWidth,
  );
  const rightLeft = targetBounds.x + targetBounds.width + TOOLTIP_MARGIN;
  const leftLeft = targetBounds.x - tooltipWidth - TOOLTIP_MARGIN;
  const fitsBelow = belowTop + tooltipHeight <= safeBottom;
  const fitsAbove = aboveTop >= safeTop;
  const fitsRight = rightLeft + tooltipWidth <= safeRight;
  const fitsLeft = leftLeft >= safeLeft;
  const preferred = [placement, "bottom", "top", "center"].filter(
    Boolean,
  ) as TourPlacement[];

  for (const nextPlacement of preferred) {
    if (nextPlacement === "bottom" && fitsBelow) {
      return {
        arrow: {
          left: clamp(
            targetBounds.x + targetBounds.width / 2 - 7,
            horizontalLeft + 20,
            horizontalLeft + tooltipWidth - 34,
          ),
          top: belowTop - 7,
        },
        left: horizontalLeft,
        top: belowTop,
      };
    }

    if (nextPlacement === "bottom" && placement === "bottom") {
      return {
        arrow: null,
        left: horizontalLeft,
        top: Math.max(safeTop, safeBottom - tooltipHeight),
      };
    }

    if (nextPlacement === "top" && fitsAbove) {
      return {
        arrow: {
          left: clamp(
            targetBounds.x + targetBounds.width / 2 - 7,
            horizontalLeft + 20,
            horizontalLeft + tooltipWidth - 34,
          ),
          top: aboveTop + tooltipHeight - 7,
        },
        left: horizontalLeft,
        top: aboveTop,
      };
    }

    if (nextPlacement === "top" && placement === "top") {
      return {
        arrow: null,
        left: horizontalLeft,
        top: safeTop,
      };
    }

    if (nextPlacement === "right" && fitsRight) {
      return {
        arrow: {
          left: rightLeft - 7,
          top: targetBounds.y + targetBounds.height / 2 - 7,
        },
        left: rightLeft,
        top: sideTop,
      };
    }

    if (nextPlacement === "left" && fitsLeft) {
      return {
        arrow: {
          left: leftLeft + tooltipWidth - 7,
          top: targetBounds.y + targetBounds.height / 2 - 7,
        },
        left: leftLeft,
        top: sideTop,
      };
    }
  }

  return {
    arrow: null,
    left: centeredLeft,
    top: centeredTop,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  arrow: {
    backgroundColor: "rgba(18, 17, 15, 0.97)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderLeftWidth: 1,
    borderTopWidth: 1,
    height: 14,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: 14,
  },
  backdropSlice: {
    backgroundColor: OVERLAY_COLOR,
    position: "absolute",
  },
  fullBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY_COLOR,
  },
  root: {
    ...StyleSheet.absoluteFillObject,
  },
});
