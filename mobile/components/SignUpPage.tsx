import { Ionicons } from "@expo/vector-icons";
import { Eye, EyeOff, KeyboardIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type KeyboardEvent,
  View,
} from "react-native";
import { useAnimatedAuthStep } from "../hooks/useAnimatedAuthStep";
import {
  getEmailError,
  getPasswordResetErrors,
  type PasswordResetErrors,
} from "../utils/authValidation";
import { withHaptic } from "../utils/haptics";
import { AuthBackButton, AuthPageLayout } from "./AuthPageLayout";
import { AuthVerificationStep } from "./AuthVerificationStep";
import { FullScreenLoadingOverlay } from "./FullScreenLoadingOverlay";

type SignUpStep = "details" | "verification";
type DetailsInputName = "email" | "password" | "confirmPassword";

const RESEND_SECONDS = 60;
const SIGN_UP_LOADING_MIN_DURATION_MS = 800;
const SIGN_UP_INPUT_ACCESSORY_ID = "sign-up-input-accessory";

interface SignUpPageProps {
  onBack: () => void;
  onComplete?: () => void;
}

interface DetailsErrors extends PasswordResetErrors {
  email?: string;
}

async function registerAccountPlaceholder(
  _email: string,
  _password: string,
): Promise<void> {
  // Placeholder for the eventual sign-up API request.
  await new Promise((resolve) => setTimeout(resolve, 220));
}

async function verifySignUpCodePlaceholder(
  _email: string,
  _code: string,
): Promise<void> {
  // Placeholder for the eventual verification API request.
  await new Promise((resolve) => setTimeout(resolve, 260));
}

async function resendConfirmationCodePlaceholder(_email: string): Promise<void> {
  // Placeholder for the eventual resend-code API request.
  await new Promise((resolve) => setTimeout(resolve, 220));
}

function getDetailsErrors(
  email: string,
  password: string,
  confirmPassword: string,
): DetailsErrors {
  return {
    ...getPasswordResetErrors(password, confirmPassword),
    email: getEmailError(email, "Enter your email to create an account."),
  };
}

function hasDetailsErrors(errors: DetailsErrors) {
  return Boolean(errors.email || errors.password || errors.confirmPassword);
}

export function SignUpPage({ onBack, onComplete }: SignUpPageProps) {
  const {
    isTransitioningRef,
    step,
    stepAnimation,
    transitionTo,
  } = useAnimatedAuthStep<SignUpStep>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [detailsErrors, setDetailsErrors] = useState<DetailsErrors>({});
  const [confirmationCode, setConfirmationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Verifying");
  const [verificationFocusToken, setVerificationFocusToken] = useState(0);
  const [activeInput, setActiveInput] = useState<DetailsInputName | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const screenAnimation = useRef(new Animated.Value(0)).current;
  const keyboardLiftAnimation = useRef(new Animated.Value(0)).current;
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const isLeavingRef = useRef(false);
  const isSubmittingDetailsRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const isResendingRef = useRef(false);
  const mountedRef = useRef(true);
  const shouldMoveToVerificationRef = useRef(false);
  const shouldCompleteAfterVerificationRef = useRef(false);
  const shouldFocusCodeAfterFailureRef = useRef(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    Animated.timing(screenAnimation, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();

    return () => {
      mountedRef.current = false;
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
      }
      if (resendFeedbackTimerRef.current !== null) {
        clearTimeout(resendFeedbackTimerRef.current);
      }
    };
  }, [screenAnimation]);

  useEffect(() => {
    if (step !== "verification" || resendSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [resendSeconds, step]);

  useEffect(() => {
    function animateKeyboardLift(target: number, duration = 240) {
      Animated.timing(keyboardLiftAnimation, {
        toValue: target,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    function handleKeyboardShow(event: KeyboardEvent) {
      const keyboardHeight = event.endCoordinates.height;
      const targetLift =
        step === "details" && activeInput !== null
          ? Math.min(132, Math.round(keyboardHeight * 0.34))
          : 0;

      animateKeyboardLift(targetLift, event.duration ?? 260);
    }

    function handleKeyboardHide(event?: KeyboardEvent) {
      animateKeyboardLift(0, event?.duration ?? 220);
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    if (activeInput === null || step !== "details") {
      animateKeyboardLift(0, 180);
    }

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [activeInput, keyboardLiftAnimation, step]);

  const exitToLogin = () => {
    if (
      isLeavingRef.current ||
      isSubmittingDetailsRef.current ||
      isVerifyingRef.current ||
      isTransitioningRef.current
    ) {
      return;
    }

    isLeavingRef.current = true;
    Keyboard.dismiss();

    Animated.timing(screenAnimation, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onBack();
        return;
      }

      isLeavingRef.current = false;
    });
  };

  const goBack = () => {
    if (step === "verification") {
      if (
        !isVerifyingRef.current &&
        !isSubmittingDetailsRef.current &&
        !isTransitioningRef.current
      ) {
        setVerificationError(null);
        setResendFeedback(null);
        transitionTo("details");
      }
      return;
    }

    exitToLogin();
  };

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const isHorizontalGesture =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

        return isHorizontalGesture && gestureState.dx > 10;
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isHorizontalGesture =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

        return isHorizontalGesture && gestureState.dx > 10;
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipedRight = gestureState.dx > 70 || gestureState.vx > 0.4;

        if (swipedRight) {
          goBack();
        }
      },
    }),
  ).current;

  const focusDetailsInput = (inputName: DetailsInputName) => {
    if (inputName === "email") {
      emailInputRef.current?.focus();
      return;
    }

    if (inputName === "password") {
      passwordInputRef.current?.focus();
      return;
    }

    confirmPasswordInputRef.current?.focus();
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
    setActiveInput(null);
  };

  const clearFieldError = (field: DetailsInputName) => {
    setDetailsErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const finishLoadingAfterMinimum = (
    startedAt: number,
    onDone: () => void,
  ) => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, SIGN_UP_LOADING_MIN_DURATION_MS - elapsed);

    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
    }

    loadingTimerRef.current = setTimeout(() => {
      loadingTimerRef.current = null;

      if (!mountedRef.current) {
        return;
      }

      onDone();
      setLoadingVisible(false);
    }, remaining);
  };

  const submitDetails = async () => {
    if (
      isSubmittingDetailsRef.current ||
      isVerifyingRef.current ||
      isTransitioningRef.current
    ) {
      return;
    }

    const nextErrors = getDetailsErrors(email, password, confirmPassword);
    if (hasDetailsErrors(nextErrors)) {
      setDetailsErrors(nextErrors);
      return;
    }

    isSubmittingDetailsRef.current = true;
    Keyboard.dismiss();
    setActiveInput(null);
    setDetailsErrors({});
    setLoadingLabel("Creating account");
    setLoadingVisible(true);
    const startedAt = Date.now();

    try {
      await registerAccountPlaceholder(email.trim(), password);
      finishLoadingAfterMinimum(startedAt, () => {
        shouldMoveToVerificationRef.current = true;
      });
    } catch {
      finishLoadingAfterMinimum(startedAt, () => {
        isSubmittingDetailsRef.current = false;
        setDetailsErrors({
          email: "We couldn't create this account. Try again.",
        });
      });
    }
  };

  const completeVerification = async (code: string) => {
    if (isVerifyingRef.current || code.length !== 6) {
      return;
    }

    isVerifyingRef.current = true;
    shouldCompleteAfterVerificationRef.current = false;
    setVerificationError(null);
    setResendFeedback(null);
    Keyboard.dismiss();
    setLoadingLabel("Verifying");
    setLoadingVisible(true);
    const startedAt = Date.now();

    try {
      await verifySignUpCodePlaceholder(email.trim(), code);
      finishLoadingAfterMinimum(startedAt, () => {
        shouldCompleteAfterVerificationRef.current = true;
      });
    } catch {
      finishLoadingAfterMinimum(startedAt, () => {
        isVerifyingRef.current = false;
        setConfirmationCode("");
        setVerificationError("That confirmation code is invalid.");
        shouldFocusCodeAfterFailureRef.current = true;
      });
    }
  };

  const handleLoadingOverlayHidden = () => {
    if (shouldMoveToVerificationRef.current) {
      shouldMoveToVerificationRef.current = false;
      isSubmittingDetailsRef.current = false;
      setResendSeconds(RESEND_SECONDS);
      setConfirmationCode("");
      setVerificationError(null);
      setResendFeedback(null);
      transitionTo("verification");
      return;
    }

    if (shouldCompleteAfterVerificationRef.current) {
      shouldCompleteAfterVerificationRef.current = false;
      onComplete?.();
      return;
    }

    if (shouldFocusCodeAfterFailureRef.current) {
      shouldFocusCodeAfterFailureRef.current = false;
      setVerificationFocusToken((token) => token + 1);
    }
  };

  const resendCode = async () => {
    if (resendSeconds > 0 || isResendingRef.current) {
      return;
    }

    isResendingRef.current = true;
    setIsResending(true);
    setVerificationError(null);
    setResendFeedback(null);

    try {
      await resendConfirmationCodePlaceholder(email.trim());

      if (!mountedRef.current) {
        return;
      }

      setResendSeconds(RESEND_SECONDS);
      setResendFeedback("A new code has been sent.");

      if (resendFeedbackTimerRef.current !== null) {
        clearTimeout(resendFeedbackTimerRef.current);
      }

      resendFeedbackTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setResendFeedback(null);
        }
      }, 3200);
    } finally {
      isResendingRef.current = false;

      if (mountedRef.current) {
        setIsResending(false);
      }
    }
  };

  const animatedContentStyle = {
    opacity: Animated.multiply(screenAnimation, stepAnimation),
    transform: [
      {
        translateY: Animated.add(
          Animated.add(
            screenAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
            stepAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          ),
          Animated.multiply(keyboardLiftAnimation, -1),
        ),
      },
      {
        scale: stepAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };
  const animatedBackButtonStyle = {
    opacity: screenAnimation,
    transform: [
      {
        translateX: screenAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [-24, 0],
        }),
      },
    ],
  };

  return (
    <>
      <AuthPageLayout
        animatedStyle={animatedContentStyle}
        contentStyle={step === "verification" ? styles.verificationOffset : null}
        headerLeft={
          <AuthBackButton
            accessibilityLabel={
              step === "verification"
                ? "Back to account details"
                : "Back to login"
            }
            animatedStyle={animatedBackButtonStyle}
            onPress={goBack}
          />
        }
        onDismissKeyboard={() => setActiveInput(null)}
        panHandlers={swipeResponder.panHandlers}
        scrollable
      >
        {step === "details" ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>
                Set up your account to keep your Mac remote ready.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={18} color="#f0a942" />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    blurOnSubmit={false}
                    inputAccessoryViewID={
                      Platform.OS === "ios"
                        ? SIGN_UP_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={(nextEmail) => {
                      setEmail(nextEmail);
                      clearFieldError("email");
                    }}
                    onFocus={() => setActiveInput("email")}
                    onSubmitEditing={() => focusDetailsInput("password")}
                    placeholder="Email"
                    placeholderTextColor="rgba(255, 255, 255, 0.38)"
                    ref={emailInputRef}
                    returnKeyType="next"
                    style={styles.input}
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>
                {detailsErrors.email ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {detailsErrors.email}
                  </Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#f0a942"
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    blurOnSubmit={false}
                    inputAccessoryViewID={
                      Platform.OS === "ios"
                        ? SIGN_UP_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    onChangeText={(nextPassword) => {
                      setPassword(nextPassword);
                      clearFieldError("password");

                      if (confirmPassword) {
                        clearFieldError("confirmPassword");
                      }
                    }}
                    onFocus={() => setActiveInput("password")}
                    onSubmitEditing={() => focusDetailsInput("confirmPassword")}
                    placeholder="Password"
                    placeholderTextColor="rgba(255, 255, 255, 0.38)"
                    ref={passwordInputRef}
                    returnKeyType="next"
                    secureTextEntry={!passwordVisible}
                    style={styles.input}
                    textContentType="newPassword"
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={
                      passwordVisible ? "Hide password" : "Show password"
                    }
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.visibilityButton}
                    onPress={withHaptic(() =>
                      setPasswordVisible((visible) => !visible),
                    )}
                  >
                    {passwordVisible ? (
                      <EyeOff size={18} color="#f0a942" />
                    ) : (
                      <Eye size={18} color="#f0a942" />
                    )}
                  </Pressable>
                </View>
                {detailsErrors.password ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {detailsErrors.password}
                  </Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color="#f0a942"
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    inputAccessoryViewID={
                      Platform.OS === "ios"
                        ? SIGN_UP_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    onChangeText={(nextConfirmPassword) => {
                      setConfirmPassword(nextConfirmPassword);
                      clearFieldError("confirmPassword");
                    }}
                    onFocus={() => setActiveInput("confirmPassword")}
                    onSubmitEditing={submitDetails}
                    placeholder="Confirm Password"
                    placeholderTextColor="rgba(255, 255, 255, 0.38)"
                    ref={confirmPasswordInputRef}
                    returnKeyType="done"
                    secureTextEntry={!confirmPasswordVisible}
                    style={styles.input}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                  <Pressable
                    accessibilityLabel={
                      confirmPasswordVisible
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.visibilityButton}
                    onPress={withHaptic(() =>
                      setConfirmPasswordVisible((visible) => !visible),
                    )}
                  >
                    {confirmPasswordVisible ? (
                      <EyeOff size={18} color="#f0a942" />
                    ) : (
                      <Eye size={18} color="#f0a942" />
                    )}
                  </Pressable>
                </View>
                {detailsErrors.confirmPassword ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {detailsErrors.confirmPassword}
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue to email verification"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.primaryButtonPressed : null,
                ]}
                onPress={withHaptic(submitDetails)}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <AuthVerificationStep
            code={confirmationCode}
            email={email.trim()}
            error={verificationError}
            focusToken={verificationFocusToken}
            isResending={isResending}
            onChangeCode={(nextCode) => {
              setConfirmationCode(nextCode);
              setVerificationError(null);
              setResendFeedback(null);
            }}
            onComplete={completeVerification}
            onResend={resendCode}
            resendFeedback={resendFeedback}
            resendSeconds={resendSeconds}
            verificationDisabled={isVerifyingRef.current}
          />
        )}
      </AuthPageLayout>

      {Platform.OS === "ios" && step === "details" ? (
        <InputAccessoryView nativeID={SIGN_UP_INPUT_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <View style={styles.keyboardAccessoryNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to previous field"
                disabled={activeInput === null || activeInput === "email"}
                style={({ pressed }) => [
                  styles.keyboardAccessoryButton,
                  activeInput === null || activeInput === "email"
                    ? styles.keyboardAccessoryButtonDisabled
                    : null,
                  pressed && activeInput !== null && activeInput !== "email"
                    ? styles.keyboardAccessoryButtonPressed
                    : null,
                ]}
                onPress={withHaptic(() => {
                  focusDetailsInput(
                    activeInput === "confirmPassword" ? "password" : "email",
                  );
                })}
              >
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color={
                    activeInput !== null && activeInput !== "email"
                      ? "#f7f5f1"
                      : "rgba(247, 245, 241, 0.34)"
                  }
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to next field"
                disabled={
                  activeInput === null || activeInput === "confirmPassword"
                }
                style={({ pressed }) => [
                  styles.keyboardAccessoryButton,
                  activeInput === null || activeInput === "confirmPassword"
                    ? styles.keyboardAccessoryButtonDisabled
                    : null,
                  pressed &&
                  activeInput !== null &&
                  activeInput !== "confirmPassword"
                    ? styles.keyboardAccessoryButtonPressed
                    : null,
                ]}
                onPress={withHaptic(() => {
                  focusDetailsInput(
                    activeInput === "email" ? "password" : "confirmPassword",
                  );
                })}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={
                    activeInput !== null && activeInput !== "confirmPassword"
                      ? "#f7f5f1"
                      : "rgba(247, 245, 241, 0.34)"
                  }
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              style={({ pressed }) => [
                styles.keyboardDismissButton,
                pressed ? styles.keyboardAccessoryButtonPressed : null,
              ]}
              onPress={withHaptic(dismissKeyboard)}
            >
              <KeyboardIcon size={18} color="#eeeeee" />
              <Ionicons name="chevron-down-outline" size={12} color="#eeeeee" />
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      <FullScreenLoadingOverlay
        accessibilityLabel={loadingLabel}
        icon="hourglass-outline"
        label={loadingLabel}
        visible={loadingVisible}
        onHidden={handleLoadingOverlayHidden}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 8,
  },

  title: {
    color: "#ffffff",
    fontFamily: "Ubuntu-Bold",
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
  },

  subtitle: {
    color: "rgba(255, 255, 255, 0.66)",
    fontFamily: "Ubuntu-Medium",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },

  verificationOffset: {
    transform: [{ translateY: -68 }],
  },

  form: {
    gap: 14,
  },

  inputGroup: {
    gap: 6,
  },

  inputWrap: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(240, 169, 66, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 52,
    paddingHorizontal: 15,
  },

  input: {
    color: "#ffffff",
    flex: 1,
    fontFamily: "Ubuntu-Medium",
    fontSize: 15,
    minWidth: 0,
    padding: 0,
  },

  visibilityButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34,
  },

  errorText: {
    color: "#ff8a8a",
    fontFamily: "Ubuntu-Bold",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  primaryButton: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderColor: "rgba(255, 210, 139, 0.7)",
    borderRadius: 20,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#ff941f",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },

  primaryButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },

  primaryButtonText: {
    color: "#14100b",
    fontFamily: "Ubuntu-Bold",
    fontSize: 16,
  },

  keyboardAccessory: {
    alignItems: "center",
    backgroundColor: "#12110f",
    borderTopColor: "rgba(240, 169, 66, 0.22)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  keyboardAccessoryNav: {
    flexDirection: "row",
    gap: 8,
  },

  keyboardAccessoryButton: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 34,
    paddingHorizontal: 10,
  },

  keyboardAccessoryButtonDisabled: {
    opacity: 0.42,
  },

  keyboardAccessoryButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },

  keyboardDismissButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
});
