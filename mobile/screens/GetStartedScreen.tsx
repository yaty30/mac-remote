import {
  Clapperboard,
  Keyboard,
  MousePointer2,
  SignalHigh,
} from "lucide-react-native";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Animated,
  Pressable,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FloatingIconOverlay } from "../components/FloatingIconOverlay";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import { withHaptic } from "../utils/haptics";

type FeatureIcon = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

interface FeatureCard {
  Icon: FeatureIcon;
  label: string;
  accent?: string;
}

interface PremiumButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}

interface Page {
  primaryLabel: string;
  secondaryLabel: string;
  subtitle: string;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
}

interface GetStartedScreenProps {
  initialPage?: number;
  onComplete: (fromPage: number) => void;
  onLogin?: (fromPage: number) => void;
  showLoginShortcut?: boolean;
}

const PremiumGradient =
  ExpoLinearGradient as unknown as ComponentType<
    Omit<LinearGradientProps, "style"> & {
      style?: unknown;
    }
  >;

const featureCards: FeatureCard[] = [
  {
    Icon: MousePointer2,
    label: "Trackpad",
  },
  {
    Icon: Keyboard,
    label: "Keyboard",
  },
  {
    Icon: Clapperboard,
    label: "Media & Browser",
  },
  {
    Icon: SignalHigh,
    label: "Low Latency",
    accent: "#38d17b",
  },
];

const pages: Page[] = [
  {
    primaryLabel: "Control Your Desktop",
    secondaryLabel: "From Your Phone.",
    subtitle: "Take full control of your Mac from anywhere, instantly.",
    primaryButtonLabel: "Get Started",
    secondaryButtonLabel: "Already have an account? Log in now",
  },
  {
    primaryLabel: "Native Mac Experience",
    secondaryLabel: "",
    subtitle: "Seamless control, as if you're right in front of your Mac.",
    primaryButtonLabel: "Next",
    secondaryButtonLabel: "Back",
  },
  {
    primaryLabel: "Everything You Need",
    secondaryLabel: "In One Place.",
    subtitle:
      "Use the trackpad, keyboard, media controls, shortcuts, and more.",
    primaryButtonLabel: "Next",
    secondaryButtonLabel: "Back",
  },
  {
    primaryLabel: "Fast. Secure.",
    secondaryLabel: "Ready to Connect.",
    subtitle:
      "Pair with your Mac in seconds and enjoy responsive, low-latency control.",
    primaryButtonLabel: "Continue",
    secondaryButtonLabel: "Back",
  },
];

function PremiumButton({
  label,
  onPress,
  variant = "primary",
}: PremiumButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        isPrimary
          ? styles.primaryButton
          : styles.secondaryButton,
        pressed ? styles.buttonPressed : null,
      ]}
      onPress={withHaptic(onPress)}
    >
      <PremiumGradient
        colors={
          isPrimary
            ? ["#ffb23d", "#ff941f", "#f58217"]
            : [
              "rgba(35, 29, 23, 0)",
              "rgba(35, 29, 23, 0)",
              "rgba(35, 29, 23, 0)",
            ]
        }
        start={{
          x: isPrimary ? 0.2 : 0.12,
          y: 0,
        }}
        end={{
          x: isPrimary ? 0.82 : 0.88,
          y: 1,
        }}
        style={styles.buttonGradient}
      >
        <Text
          style={[
            isPrimary
              ? styles.primaryButtonText
              : styles.secondaryButtonText,
          ]}
        >
          {label}
        </Text>
      </PremiumGradient>
    </Pressable>
  );
}

export function GetStartedScreen({
  initialPage = 0,
  onComplete,
  onLogin,
  showLoginShortcut = true,
}: GetStartedScreenProps) {
  const boundedInitialPage = Math.min(
    Math.max(initialPage, 0),
    pages.length - 1,
  );
  const [currentPage, setCurrentPage] = useState(boundedInitialPage);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const currentPageRef = useRef(currentPage);
  const isTransitioningRef = useRef(isTransitioning);
  const isExitingRef = useRef(false);

  currentPageRef.current = currentPage;
  isTransitioningRef.current = isTransitioning;

  const screenExitAnimation = useRef(
    new Animated.Value(1),
  ).current;

  const contentAnimation = useRef(
    new Animated.Value(1),
  ).current;

  const skipButtonAnimation = useRef(
    new Animated.Value(0),
  ).current;

  /*
   * The value represents the active page index:
   *
   * 0 = first dot
   * 1 = second dot
   * 2 = third dot
   * 3 = fourth dot
   */
  const stepAnimation = useRef(
    new Animated.Value(boundedInitialPage),
  ).current;

  const animateToPage = (nextPage: number) => {
    const activePage = currentPageRef.current;

    if (
      isTransitioningRef.current ||
      isExitingRef.current ||
      nextPage < 0 ||
      nextPage >= pages.length ||
      nextPage === activePage
    ) {
      return;
    }

    isTransitioningRef.current = true;
    setIsTransitioning(true);
    contentAnimation.stopAnimation();

    /*
     * Move the active dot immediately while the old
     * page content fades away.
     */
    Animated.spring(stepAnimation, {
      toValue: nextPage,
      stiffness: 180,
      damping: 18,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

    /*
     * Fade the current content out before swapping copy.
     */
    Animated.timing(contentAnimation, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
        return;
      }

      currentPageRef.current = nextPage;
      contentAnimation.setValue(0);
      setCurrentPage(nextPage);

      /*
       * The value is already at zero, so the newly
       * rendered page begins hidden.
       */
      Animated.timing(contentAnimation, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start(({ finished: enterFinished }) => {
        if (!enterFinished) {
          return;
        }

        isTransitioningRef.current = false;
        setIsTransitioning(false);
      });
    });
  };

  const completeWithExitFade = () => {
    if (isExitingRef.current || isTransitioningRef.current) {
      return;
    }

    isExitingRef.current = true;
    contentAnimation.stopAnimation();
    stepAnimation.stopAnimation();

    Animated.timing(screenExitAnimation, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onComplete(currentPageRef.current);
        return;
      }

      isExitingRef.current = false;
    });
  };

  const onNextPage = () => {
    if (isTransitioningRef.current || isExitingRef.current) {
      return;
    }

    const activePage = currentPageRef.current;
    const isLastPage =
      activePage === pages.length - 1;

    if (isLastPage) {
      completeWithExitFade();
      return;
    }

    animateToPage(activePage + 1);
  };

  const onPreviousPage = () => {
    animateToPage(currentPageRef.current - 1);
  };

  const onSecondaryButtonPress = () => {
    if (isTransitioningRef.current || isExitingRef.current) {
      return;
    }

    const activePage = currentPageRef.current;

    if (activePage === 0) {
      onLogin?.(activePage);
      return;
    }

    onPreviousPage();
  };

  const animatedContentStyle = {
    opacity: contentAnimation,
    transform: [
      {
        translateY: contentAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [-28, -40],
        }),
      },
      {
        scale: contentAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };

  const animatedScreenExitStyle = {
    opacity: screenExitAnimation,
  };

  /*
   * Each dot is 8px wide and the gap is 10px.
   *
   * Distance from one dot to the next:
   * 8 + 10 = 18px
   */
  const stepDistance = 18;
  const activeStepStyle = {
    transform: [
      {
        translateX: stepAnimation.interpolate({
          inputRange: pages.map((_, index) => index),
          outputRange: pages.map((_, index) => index * stepDistance),
        }),
      },
    ],
  };

  const page = pages[currentPage];
  const shouldShowSecondaryButton =
    page.secondaryButtonLabel &&
    (currentPage !== 0 || showLoginShortcut);
  const shouldShowSkipButton =
    currentPage > 0 && currentPage < pages.length - 1;
  const animatedSkipButtonStyle = {
    opacity: skipButtonAnimation,
  };

  useEffect(() => {
    Animated.timing(skipButtonAnimation, {
      toValue: shouldShowSkipButton ? 1 : 0,
      duration: shouldShowSkipButton ? 260 : 160,
      useNativeDriver: true,
    }).start();
  }, [shouldShowSkipButton, skipButtonAnimation]);

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isHorizontalGesture =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

        const passedMovementThreshold =
          Math.abs(gestureState.dx) > 8;

        return isHorizontalGesture && passedMovementThreshold;
      },

      onPanResponderRelease: (_, gestureState) => {
        if (isExitingRef.current || isTransitioningRef.current) {
          return;
        }

        const swipeThreshold = 60;
        const velocityThreshold = 0.35;

        const swipedLeft =
          gestureState.dx < -swipeThreshold ||
          gestureState.vx < -velocityThreshold;

        const swipedRight =
          gestureState.dx > swipeThreshold ||
          gestureState.vx > velocityThreshold;

        const activePage = currentPageRef.current;

        if (
          swipedLeft &&
          activePage < pages.length - 1
        ) {
          animateToPage(activePage + 1);
          return;
        }

        if (
          swipedRight &&
          activePage > 0
        ) {
          animateToPage(activePage - 1);
        }
      },
    }),
  ).current;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={[styles.container, animatedScreenExitStyle]}
        {...swipeResponder.panHandlers}
      >
        <FloatingIconOverlay active style={styles.floatingIconOverlay} maxOpacity={0.26} />
        <Animated.View
          accessibilityElementsHidden={!shouldShowSkipButton}
          importantForAccessibility={
            shouldShowSkipButton ? "auto" : "no-hide-descendants"
          }
          pointerEvents={shouldShowSkipButton ? "auto" : "none"}
          style={[
            styles.skipButtonContainer,
            animatedSkipButtonStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={12}
            style={({ pressed }) => [
              styles.skipButton,
              pressed
                ? styles.textButtonPressed
                : null,
            ]}
            onPress={withHaptic(completeWithExitFade)}
          >
            <Text style={styles.skipButtonText}>
              Skip
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.centerContent,
            animatedContentStyle,
          ]}
        >
          <Text style={styles.title}>
            {page.primaryLabel}
          </Text>

          {page.secondaryLabel ? (
            <Text
              style={[
                styles.title,
                styles.titleAccent,
              ]}
            >
              {page.secondaryLabel}
            </Text>
          ) : null}

          <Text style={styles.subtitle}>
            {page.subtitle}
          </Text>

          {currentPage === 1 && (
            <View style={styles.featureGrid}>
              {featureCards.map(
                ({
                  Icon,
                  accent = "#f0a942",
                  label,
                }) => (
                  <View
                    key={label}
                    style={styles.featureCard}
                  >
                    <PremiumGradient
                      colors={[
                        "rgba(44, 33, 23, 0.72)",
                        "rgba(24, 20, 16, 0.72)",
                        "rgba(14, 13, 11, 0.72)",
                      ]}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={
                        styles.featureCardGradient
                      }
                    >
                      <Icon
                        size={30}
                        color={accent}
                        strokeWidth={1.9}
                      />

                      <Text style={styles.featureLabel}>
                        {label}
                      </Text>
                    </PremiumGradient>
                  </View>
                ),
              )}
            </View>
          )}

        </Animated.View>

        {/*
         * The footer is outside centerContent, so the
         * dots do not inherit the content fade animation.
         */}
        <View style={styles.footer}>
          <View
            style={styles.stepIndicator}
            accessibilityRole="progressbar"
            accessibilityLabel="Onboarding progress"
            accessibilityValue={{
              min: 1,
              max: pages.length,
              now: currentPage + 1,
            }}
          >
            {pages.map((_, index) => (
              <View
                key={index}
                style={styles.stepDot}
              />
            ))}

            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeStepDot,
                activeStepStyle,
              ]}
            />
          </View>

          {page.primaryButtonLabel && 
            <PremiumButton
              label={page.primaryButtonLabel}
              variant="primary"
              onPress={onNextPage}
            />
          }

          {shouldShowSecondaryButton &&
            <PremiumButton
              label={page.secondaryButtonLabel}
              variant="secondary"
              onPress={onSecondaryButtonPress}
            />
          }
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#070707",
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },

  centerContent: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    transform: [{ translateY: -40 }],
    zIndex: 1,
  },

  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 24,
    gap: 12,
    zIndex: 1,
  },

  floatingIconOverlay: {
    zIndex: 0,
  },

  skipButtonContainer: {
    position: "absolute",
    right: 10,
    top: 0,
    zIndex: 2,
  },

  stepIndicator: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 10,
    height: 8,
    marginBottom: 8,
    position: "relative",
  },

  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.24)",
  },

  activeStepDot: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff9d23",
    shadowColor: "#ff9d23",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.65,
    shadowRadius: 5,
  },

  title: {
    color: "#ffffff",
    fontFamily: "Ubuntu-Bold",
    fontSize: 31,
    lineHeight: 37,
    textAlign: "center",
    marginVertical: 4,
  },

  titleAccent: {
    color: "#ff9d23",
  },

  subtitle: {
    color: "rgba(255, 255, 255, 0.66)",
    fontFamily: "Ubuntu-Medium",
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 286,
    marginVertical: 8,
    textAlign: "center",
  },

  button: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: "100%",
  },

  primaryButton: {
    backgroundColor: "#ff941f",
    borderColor: "rgba(255, 210, 139, 0.7)",
    shadowColor: "#ff941f",
    shadowOpacity: 0.22,
  },

  secondaryButton: {
    // backgroundColor: "none",
    // borderColor: "none",
  },

  buttonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  buttonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },

  primaryButtonText: {
    color: "#14100b",
    fontFamily: "Ubuntu-Bold",
    fontSize: 16,
  },

  secondaryButtonText: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: "Ubuntu-Bold",
    fontSize: 14,
  },

  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 30,
    width: "100%",
  },

  featureCard: {
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(240, 169, 66, 0.28)",
    borderRadius: 18,
    borderWidth: 1,
    height: 96,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    width: "47%",
  },

  featureCardGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  featureLabel: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: "Ubuntu-Bold",
    fontSize: 13,
    lineHeight: 17,
    textAlign: "center",
  },

  skipButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    minWidth: 52,
  },

  skipButtonText: {
    color: "rgba(255, 255, 255, 0.78)",
    fontFamily: "Ubuntu-Bold",
    fontSize: 14,
  },

  textButtonPressed: {
    opacity: 0.7,
  },
});
