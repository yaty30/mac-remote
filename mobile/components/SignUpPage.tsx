import { Ionicons } from "@expo/vector-icons";
import { ArrowLeft, Eye, EyeOff, KeyboardIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type KeyboardEvent,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FloatingIconOverlay } from "./FloatingIconOverlay";
import { FullScreenLoadingOverlay } from "./FullScreenLoadingOverlay";
import { VerificationCodeInput } from "./VerificationCodeInput";
import { withHaptic } from "../utils/haptics";

type SignUpStep = "details" | "verification";
type DetailsInputName = "email" | "password" | "confirmPassword";

const PASSWORD_MIN_LENGTH = 8;
const RESEND_SECONDS = 60;
const VERIFICATION_LOADING_MIN_DURATION_MS = 800;
const SIGN_UP_INPUT_ACCESSORY_ID = "sign-up-input-accessory";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignUpPageProps {
  onBack: () => void;
  onComplete?: () => void;
}

interface DetailsErrors {
  confirmPassword?: string;
  email?: string;
  password?: string;
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
  const nextErrors: DetailsErrors = {};
  const cleanEmail = email.trim();

  if (!cleanEmail) {
    nextErrors.email = "Enter your email to create an account.";
  } else if (!EMAIL_PATTERN.test(cleanEmail)) {
    nextErrors.email = "Enter a valid email address.";
  }

  if (!password) {
    nextErrors.password = "Enter a password.";
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    nextErrors.password = "Use at least eight characters.";
  }

  if (!confirmPassword) {
    nextErrors.confirmPassword = "Confirm your password.";
  } else if (password && confirmPassword !== password) {
    nextErrors.confirmPassword = "Passwords do not match.";
  }

  return nextErrors;
}

function hasErrors(errors: DetailsErrors) {
  return Boolean(errors.email || errors.password || errors.confirmPassword);
}

export function SignUpPage({ onBack, onComplete }: SignUpPageProps) {
  const [step, setStep] = useState<SignUpStep>("details");
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
  const [verificationLoadingVisible, setVerificationLoadingVisible] =
    useState(false);
  const [verificationFocusToken, setVerificationFocusToken] = useState(0);
  const [activeInput, setActiveInput] = useState<DetailsInputName | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const screenAnimation = useRef(new Animated.Value(0)).current;
  const contentAnimation = useRef(new Animated.Value(1)).current;
  const keyboardLiftAnimation = useRef(new Animated.Value(0)).current;
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const isLeavingRef = useRef(false);
  const isSubmittingDetailsRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const isResendingRef = useRef(false);
  const mountedRef = useRef(true);
  const shouldCompleteAfterVerificationRef = useRef(false);
  const shouldFocusCodeAfterFailureRef = useRef(false);
  const verificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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
      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
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
    if (isLeavingRef.current || isVerifyingRef.current) {
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

  const animateStepChange = (nextStep: SignUpStep) => {
    if (step === nextStep || isLeavingRef.current || isVerifyingRef.current) {
      return;
    }

    Keyboard.dismiss();
    Animated.timing(contentAnimation, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setStep(nextStep);
      Animated.timing(contentAnimation, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });
  };

  const goBack = () => {
    if (step === "verification") {
      if (!isVerifyingRef.current) {
        setVerificationError(null);
        setResendFeedback(null);
        animateStepChange("details");
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

  const submitDetails = () => {
    if (isSubmittingDetailsRef.current || isVerifyingRef.current) {
      return;
    }

    isSubmittingDetailsRef.current = true;
    Keyboard.dismiss();
    setDetailsErrors({});
    setResendSeconds(RESEND_SECONDS);
    setConfirmationCode("");
    setVerificationError(null);
    setResendFeedback(null);
    animateStepChange("verification");
    isSubmittingDetailsRef.current = false;
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
    setVerificationLoadingVisible(true);

    const startedAt = Date.now();

    try {
      await verifySignUpCodePlaceholder(email.trim(), code);

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(
        0,
        VERIFICATION_LOADING_MIN_DURATION_MS - elapsed,
      );

      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
      }

      verificationTimerRef.current = setTimeout(() => {
        verificationTimerRef.current = null;

        if (!mountedRef.current) {
          return;
        }

        shouldCompleteAfterVerificationRef.current = true;
        setVerificationLoadingVisible(false);
      }, remaining);
    } catch {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(
        0,
        VERIFICATION_LOADING_MIN_DURATION_MS - elapsed,
      );

      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
      }

      verificationTimerRef.current = setTimeout(() => {
        verificationTimerRef.current = null;

        if (!mountedRef.current) {
          return;
        }

        isVerifyingRef.current = false;
        setConfirmationCode("");
        setVerificationError("That confirmation code is invalid.");
        shouldFocusCodeAfterFailureRef.current = true;
        setVerificationLoadingVisible(false);
      }, remaining);
    }
  };

  const handleVerificationOverlayHidden = () => {
    if (shouldCompleteAfterVerificationRef.current) {
      shouldCompleteAfterVerificationRef.current = false;
      onComplete?.();
      return;
    }

    isVerifyingRef.current = false;

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
        setResendFeedback(null);
      }, 3200);
    } finally {
      isResendingRef.current = false;

      if (mountedRef.current) {
        setIsResending(false);
      }
    }
  };

  const animatedContentStyle = {
    opacity: Animated.multiply(screenAnimation, contentAnimation),
    transform: [
      {
        translateY: Animated.add(
          Animated.add(
            screenAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
            contentAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          ),
          Animated.multiply(keyboardLiftAnimation, -1),
        ),
      },
      {
        scale: contentAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };
  const animatedVerificationStyle = {
    opacity: Animated.multiply(screenAnimation, contentAnimation),
    transform: [
      {
        translateY: Animated.add(
          Animated.add(
            screenAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [24, -68],
            }),
            contentAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          ),
          Animated.multiply(keyboardLiftAnimation, -1),
        ),
      },
      {
        scale: contentAnimation.interpolate({
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
  const resendDisabled = resendSeconds > 0 || isResending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={styles.screen}
        {...swipeResponder.panHandlers}
      >
        <Pressable
          accessibilityLabel="Dismiss keyboard"
          style={styles.dismissPressable}
          onPress={dismissKeyboard}
        >
          <FloatingIconOverlay active maxOpacity={0.26} />

          <Animated.View
            style={[
              styles.backButtonContainer,
              animatedBackButtonStyle,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                step === "verification"
                  ? "Back to account details"
                  : "Back to login"
              }
              hitSlop={12}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
              onPress={withHaptic(goBack)}
            >
              <ArrowLeft size={23} color="#ffffff" strokeWidth={2.2} />
            </Pressable>
          </Animated.View>

          <Animated.View
            pointerEvents="box-none"
            style={[styles.animatedContent, animatedContentStyle]}
          >
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
            >
              <View pointerEvents="box-none" style={styles.container}>
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
                          <Ionicons
                            name="mail-outline"
                            size={18}
                            color="#f0a942"
                          />
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
                            onSubmitEditing={() =>
                              focusDetailsInput("confirmPassword")
                            }
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
                  <Animated.View style={[styles.header, animatedVerificationStyle]}>
                    <View style={styles.header}>
                      <Text style={styles.title}>Check Your Email</Text>
                      <Text style={styles.subtitle}>
                        Enter the 6-character code sent to
                      </Text>
                      <Text style={styles.emailText} numberOfLines={1}>
                        {email.trim()}
                      </Text>
                    </View>

                    <View style={styles.verificationContent}>
                      <VerificationCodeInput
                        code={confirmationCode}
                        disabled={isVerifyingRef.current}
                        error={Boolean(verificationError)}
                        focusToken={verificationFocusToken}
                        onChangeCode={(nextCode) => {
                          setConfirmationCode(nextCode);
                          setVerificationError(null);
                          setResendFeedback(null);
                        }}
                        onComplete={completeVerification}
                      />

                      {verificationError ? (
                        <Text accessibilityRole="alert" style={styles.errorText}>
                          {verificationError}
                        </Text>
                      ) : null}

                      {resendFeedback ? (
                        <Text style={styles.feedbackText}>{resendFeedback}</Text>
                      ) : null}

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Resend code"
                        disabled={resendDisabled}
                        style={({ pressed }) => [
                          styles.resendButton,
                          resendDisabled ? styles.resendButtonDisabled : null,
                          pressed && !resendDisabled
                            ? styles.resendButtonPressed
                            : null,
                        ]}
                        onPress={withHaptic(resendCode)}
                      >
                        <Text
                          style={[
                            styles.resendButtonText,
                            resendDisabled
                              ? styles.resendButtonTextDisabled
                              : null,
                          ]}
                        >
                          {isResending
                            ? "Sending..."
                            : resendSeconds > 0
                              ? `Resend code in ${resendSeconds}s`
                              : "Resend code"}
                        </Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Animated.View>

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
                  focusDetailsInput(activeInput === "email" ? "password" : "confirmPassword");
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
        accessibilityLabel="Verifying"
        icon="hourglass-outline"
        label="Verifying"
        visible={verificationLoadingVisible}
        onHidden={handleVerificationOverlayHidden}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#070707",
    flex: 1,
  },

  screen: {
    backgroundColor: "rgba(0, 0, 0, 0.52)",
    flex: 1,
  },

  dismissPressable: {
    flex: 1,
  },

  backButtonContainer: {
    left: 16,
    position: "absolute",
    top: 8,
    zIndex: 3,
  },

  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },

  backButtonPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },

  animatedContent: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  container: {
    gap: 18,
    maxWidth: 330,
    width: "100%",
  },

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

  emailText: {
    color: "#ffb23d",
    fontFamily: "Ubuntu-Bold",
    fontSize: 14,
    maxWidth: "100%",
    textAlign: "center",
    marginVertical: 24
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

  verificationContent: {
    alignItems: "center",
    gap: 14,
    width: "100%",
  },

  feedbackText: {
    color: "#8bd99f",
    fontFamily: "Ubuntu-Bold",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  resendButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 10,
  },

  resendButtonDisabled: {
    opacity: 0.62,
  },

  resendButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },

  resendButtonText: {
    color: "#ffb23d",
    fontFamily: "Ubuntu-Bold",
    fontSize: 13,
    textAlign: "center",
  },

  resendButtonTextDisabled: {
    color: "rgba(255, 255, 255, 0.52)",
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
