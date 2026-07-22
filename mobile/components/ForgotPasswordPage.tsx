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

type ForgotPasswordStep = "email" | "verification" | "resetPassword";
type ForgotPasswordInputName = "email" | "password" | "confirmPassword";

const RESEND_SECONDS = 60;
const FORGOT_PASSWORD_LOADING_MIN_DURATION_MS = 800;
const FORGOT_PASSWORD_INPUT_ACCESSORY_ID = "forgot-password-input-accessory";

interface ForgotPasswordPageProps {
  onBack: () => void;
  onComplete?: () => void;
}

async function requestPasswordResetCodePlaceholder(
  _email: string,
): Promise<void> {
  // Placeholder for the eventual reset-code API request.
  await new Promise((resolve) => setTimeout(resolve, 220));
}

async function verifyPasswordResetCodePlaceholder(
  _email: string,
  _code: string,
): Promise<void> {
  // Placeholder for the eventual reset-code verification API request.
  await new Promise((resolve) => setTimeout(resolve, 260));
}

async function resendPasswordResetCodePlaceholder(
  _email: string,
): Promise<void> {
  // Placeholder for the eventual reset-code resend API request.
  await new Promise((resolve) => setTimeout(resolve, 220));
}

async function resetPasswordPlaceholder(
  _email: string,
  _code: string,
  _password: string,
): Promise<void> {
  // Placeholder for the eventual password-reset API request.
  await new Promise((resolve) => setTimeout(resolve, 260));
}

function hasPasswordErrors(errors: PasswordResetErrors) {
  return Boolean(errors.password || errors.confirmPassword);
}

export function ForgotPasswordPage({
  onBack,
  onComplete,
}: ForgotPasswordPageProps) {
  const {
    isTransitioningRef,
    step,
    stepAnimation,
    transitionTo,
  } = useAnimatedAuthStep<ForgotPasswordStep>("email");
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<PasswordResetErrors>({});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Sending code");
  const [verificationFocusToken, setVerificationFocusToken] = useState(0);
  const [activeInput, setActiveInput] =
    useState<ForgotPasswordInputName | null>(null);

  const screenAnimation = useRef(new Animated.Value(0)).current;
  const keyboardLiftAnimation = useRef(new Animated.Value(0)).current;
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const isLeavingRef = useRef(false);
  const isSubmittingEmailRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const isResettingPasswordRef = useRef(false);
  const isResendingRef = useRef(false);
  const mountedRef = useRef(true);
  const shouldMoveToVerificationRef = useRef(false);
  const shouldMoveToResetPasswordRef = useRef(false);
  const shouldCompleteAfterResetRef = useRef(false);
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
      const shouldLift =
        activeInput !== null &&
        (step === "email" || step === "resetPassword");
      const targetLift = shouldLift
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

    if (
      activeInput === null ||
      (step !== "email" && step !== "resetPassword")
    ) {
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
      isSubmittingEmailRef.current ||
      isVerifyingRef.current ||
      isResettingPasswordRef.current ||
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
    if (
      isSubmittingEmailRef.current ||
      isVerifyingRef.current ||
      isResettingPasswordRef.current ||
      isTransitioningRef.current
    ) {
      return;
    }

    if (step === "resetPassword") {
      setPasswordErrors({});
      transitionTo("verification");
      return;
    }

    if (step === "verification") {
      setVerificationError(null);
      setResendFeedback(null);
      transitionTo("email");
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

  const focusInput = (inputName: ForgotPasswordInputName) => {
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

  const finishLoadingAfterMinimum = (
    startedAt: number,
    onDone: () => void,
  ) => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(
      0,
      FORGOT_PASSWORD_LOADING_MIN_DURATION_MS - elapsed,
    );

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

  const submitEmail = async () => {
    if (isSubmittingEmailRef.current || isTransitioningRef.current) {
      return;
    }

    const nextError = getEmailError(email, "Enter your email.");
    if (nextError) {
      setEmailError(nextError);
      return;
    }

    const cleanEmail = email.trim();
    isSubmittingEmailRef.current = true;
    Keyboard.dismiss();
    setActiveInput(null);
    setEmailError(null);
    setSubmittedEmail(cleanEmail);
    setLoadingLabel("Sending code");
    setLoadingVisible(true);
    const startedAt = Date.now();

    try {
      await requestPasswordResetCodePlaceholder(cleanEmail);
      finishLoadingAfterMinimum(startedAt, () => {
        shouldMoveToVerificationRef.current = true;
      });
    } catch {
      finishLoadingAfterMinimum(startedAt, () => {
        isSubmittingEmailRef.current = false;
        setEmailError("We couldn't send a code. Try again.");
      });
    }
  };

  const completeVerification = async (code: string) => {
    if (isVerifyingRef.current || code.length !== 6) {
      return;
    }

    isVerifyingRef.current = true;
    setVerificationError(null);
    setResendFeedback(null);
    Keyboard.dismiss();
    setLoadingLabel("Verifying");
    setLoadingVisible(true);
    const startedAt = Date.now();

    try {
      await verifyPasswordResetCodePlaceholder(submittedEmail, code);
      finishLoadingAfterMinimum(startedAt, () => {
        shouldMoveToResetPasswordRef.current = true;
      });
    } catch {
      finishLoadingAfterMinimum(startedAt, () => {
        isVerifyingRef.current = false;
        setVerificationCode("");
        setVerificationError("That verification code is invalid.");
        shouldFocusCodeAfterFailureRef.current = true;
      });
    }
  };

  const submitResetPassword = async () => {
    if (isResettingPasswordRef.current || isTransitioningRef.current) {
      return;
    }

    const nextErrors = getPasswordResetErrors(password, confirmPassword);
    if (hasPasswordErrors(nextErrors)) {
      setPasswordErrors(nextErrors);
      return;
    }

    isResettingPasswordRef.current = true;
    Keyboard.dismiss();
    setActiveInput(null);
    setPasswordErrors({});
    setLoadingLabel("Resetting password");
    setLoadingVisible(true);
    const startedAt = Date.now();

    try {
      await resetPasswordPlaceholder(
        submittedEmail,
        verificationCode,
        password,
      );
      finishLoadingAfterMinimum(startedAt, () => {
        shouldCompleteAfterResetRef.current = true;
      });
    } catch {
      finishLoadingAfterMinimum(startedAt, () => {
        isResettingPasswordRef.current = false;
        setPasswordErrors({
          password: "We couldn't reset your password. Try again.",
        });
      });
    }
  };

  const handleLoadingOverlayHidden = () => {
    if (shouldMoveToVerificationRef.current) {
      shouldMoveToVerificationRef.current = false;
      isSubmittingEmailRef.current = false;
      setResendSeconds(RESEND_SECONDS);
      setVerificationCode("");
      setVerificationError(null);
      setResendFeedback(null);
      transitionTo("verification");
      return;
    }

    if (shouldMoveToResetPasswordRef.current) {
      shouldMoveToResetPasswordRef.current = false;
      isVerifyingRef.current = false;
      transitionTo("resetPassword");
      return;
    }

    if (shouldCompleteAfterResetRef.current) {
      shouldCompleteAfterResetRef.current = false;
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
      await resendPasswordResetCodePlaceholder(submittedEmail);

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

  const clearPasswordError = (field: keyof PasswordResetErrors) => {
    setPasswordErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
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
              step === "email"
                ? "Back to login"
                : step === "verification"
                  ? "Back to forgot password"
                  : "Back to verification"
            }
            animatedStyle={animatedBackButtonStyle}
            onPress={goBack}
          />
        }
        onDismissKeyboard={() => setActiveInput(null)}
        panHandlers={swipeResponder.panHandlers}
        scrollable
      >
        {step === "email" ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Forgot Password</Text>
              <Text style={styles.subtitle}>
                Enter your email and we'll send a verification code.
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
                    inputAccessoryViewID={
                      Platform.OS === "ios"
                        ? FORGOT_PASSWORD_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={(nextEmail) => {
                      setEmail(nextEmail);
                      setEmailError(null);
                    }}
                    onFocus={() => setActiveInput("email")}
                    onSubmitEditing={submitEmail}
                    placeholder="Email"
                    placeholderTextColor="rgba(255, 255, 255, 0.38)"
                    ref={emailInputRef}
                    returnKeyType="done"
                    style={styles.input}
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>
                {emailError ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {emailError}
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send password reset code"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.primaryButtonPressed : null,
                ]}
                onPress={withHaptic(submitEmail)}
              >
                <Text style={styles.primaryButtonText}>Send Code</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === "verification" ? (
          <AuthVerificationStep
            code={verificationCode}
            email={submittedEmail}
            error={verificationError}
            focusToken={verificationFocusToken}
            isResending={isResending}
            onChangeCode={(nextCode) => {
              setVerificationCode(nextCode);
              setVerificationError(null);
              setResendFeedback(null);
            }}
            onComplete={completeVerification}
            onResend={resendCode}
            resendFeedback={resendFeedback}
            resendSeconds={resendSeconds}
            verificationDisabled={isVerifyingRef.current}
          />
        ) : null}

        {step === "resetPassword" ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Create a new password for your account.
              </Text>
            </View>

            <View style={styles.form}>
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
                        ? FORGOT_PASSWORD_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    onChangeText={(nextPassword) => {
                      setPassword(nextPassword);
                      clearPasswordError("password");

                      if (confirmPassword) {
                        clearPasswordError("confirmPassword");
                      }
                    }}
                    onFocus={() => setActiveInput("password")}
                    onSubmitEditing={() => focusInput("confirmPassword")}
                    placeholder="New Password"
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
                {passwordErrors.password ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {passwordErrors.password}
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
                        ? FORGOT_PASSWORD_INPUT_ACCESSORY_ID
                        : undefined
                    }
                    onChangeText={(nextConfirmPassword) => {
                      setConfirmPassword(nextConfirmPassword);
                      clearPasswordError("confirmPassword");
                    }}
                    onFocus={() => setActiveInput("confirmPassword")}
                    onSubmitEditing={submitResetPassword}
                    placeholder="Confirm New Password"
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
                {passwordErrors.confirmPassword ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {passwordErrors.confirmPassword}
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset password"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.primaryButtonPressed : null,
                ]}
                onPress={withHaptic(submitResetPassword)}
              >
                <Text style={styles.primaryButtonText}>Reset Password</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </AuthPageLayout>

      {Platform.OS === "ios" && step !== "verification" ? (
        <InputAccessoryView nativeID={FORGOT_PASSWORD_INPUT_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <View style={styles.keyboardAccessoryNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to previous field"
                disabled={activeInput !== "confirmPassword"}
                style={({ pressed }) => [
                  styles.keyboardAccessoryButton,
                  activeInput !== "confirmPassword"
                    ? styles.keyboardAccessoryButtonDisabled
                    : null,
                  pressed && activeInput === "confirmPassword"
                    ? styles.keyboardAccessoryButtonPressed
                    : null,
                ]}
                onPress={withHaptic(() => focusInput("password"))}
              >
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color={
                    activeInput === "confirmPassword"
                      ? "#f7f5f1"
                      : "rgba(247, 245, 241, 0.34)"
                  }
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to next field"
                disabled={activeInput !== "password"}
                style={({ pressed }) => [
                  styles.keyboardAccessoryButton,
                  activeInput !== "password"
                    ? styles.keyboardAccessoryButtonDisabled
                    : null,
                  pressed && activeInput === "password"
                    ? styles.keyboardAccessoryButtonPressed
                    : null,
                ]}
                onPress={withHaptic(() => focusInput("confirmPassword"))}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={
                    activeInput === "password"
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
