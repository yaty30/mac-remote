import { Ionicons } from "@expo/vector-icons";
import { KeyboardIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  InputAccessoryView,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { withHaptic } from "../utils/haptics";
import { AuthBackButton, AuthPageLayout } from "./AuthPageLayout";
import { FullScreenLoadingOverlay } from "./FullScreenLoadingOverlay";

const LOGIN_LOADING_MIN_DURATION_MS = 800;
const LOGIN_INPUT_ACCESSORY_ID = "login-input-accessory";

interface LoginPageProps {
  onBack: () => void;
  onForgotPassword?: () => void;
  onLogin?: () => void;
  onSignUp?: () => void;
}

export function LoginPage({
  onBack,
  onForgotPassword,
  onLogin,
  onSignUp,
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginLoadingVisible, setLoginLoadingVisible] = useState(false);
  const [activeInput, setActiveInput] = useState<"email" | "password" | null>(
    null,
  );

  const isLeavingRef = useRef(false);
  const isLoginLoadingRef = useRef(false);
  const loginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const shouldNavigateAfterLoginRef = useRef(false);
  const screenAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenAnimation, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [screenAnimation]);

  useEffect(
    () => () => {
      if (loginTimerRef.current !== null) {
        clearTimeout(loginTimerRef.current);
        loginTimerRef.current = null;
      }
    },
    [],
  );

  const goBack = () => {
    if (isLeavingRef.current || isLoginLoadingRef.current) {
      return;
    }

    isLeavingRef.current = true;

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
        if (isLoginLoadingRef.current) {
          return;
        }

        const swipedRight = gestureState.dx > 70 || gestureState.vx > 0.4;

        if (swipedRight) {
          goBack();
        }
      },
    }),
  ).current;

  const startLoginLoading = () => {
    if (isLoginLoadingRef.current || isLeavingRef.current) {
      return;
    }

    isLoginLoadingRef.current = true;
    Keyboard.dismiss();
    shouldNavigateAfterLoginRef.current = false;
    setLoginLoadingVisible(true);

    loginTimerRef.current = setTimeout(() => {
      loginTimerRef.current = null;
      shouldNavigateAfterLoginRef.current = true;
      setLoginLoadingVisible(false);
    }, LOGIN_LOADING_MIN_DURATION_MS);
  };

  const handleCredentialLogin = () => {
    const emailIsEmpty = email.trim().length === 0;
    const passwordIsEmpty = password.trim().length === 0;

    if (emailIsEmpty || passwordIsEmpty) {
      setErrorMessage(
        emailIsEmpty && passwordIsEmpty
          ? "Enter your email and password to log in."
          : emailIsEmpty
            ? "Enter your email to log in."
            : "Enter your password to log in.",
      );
      return;
    }

    setErrorMessage(null);
    startLoginLoading();
  };

  const handleSocialLogin = () => {
    setErrorMessage(null);
    startLoginLoading();
  };

  const focusEmailInput = () => {
    emailInputRef.current?.focus();
  };

  const focusPasswordInput = () => {
    passwordInputRef.current?.focus();
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
    setActiveInput(null);
  };

  const handleLoginOverlayHidden = () => {
    isLoginLoadingRef.current = false;

    if (shouldNavigateAfterLoginRef.current) {
      shouldNavigateAfterLoginRef.current = false;
      onLogin?.();
    }
  };

  const animatedContentStyle = {
    opacity: screenAnimation,
    transform: [
      {
        translateY: screenAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        scale: screenAnimation.interpolate({
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
        headerLeft={
          <AuthBackButton
            accessibilityLabel="Back to onboarding"
            animatedStyle={animatedBackButtonStyle}
            onPress={goBack}
          />
        }
        onDismissKeyboard={() => setActiveInput(null)}
        panHandlers={swipeResponder.panHandlers}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Log in to continue controlling your Mac.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color="#f0a942" />

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              blurOnSubmit={false}
              inputAccessoryViewID={
                Platform.OS === "ios" ? LOGIN_INPUT_ACCESSORY_ID : undefined
              }
              inputMode="email"
              keyboardType="email-address"
              onChangeText={(nextEmail) => {
                setEmail(nextEmail);
                if (errorMessage) {
                  setErrorMessage(null);
                }
              }}
              onFocus={() => setActiveInput("email")}
              onSubmitEditing={focusPasswordInput}
              placeholder="Email"
              placeholderTextColor="rgba(255, 255, 255, 0.38)"
              ref={emailInputRef}
              returnKeyType="next"
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#f0a942" />

            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              inputAccessoryViewID={
                Platform.OS === "ios" ? LOGIN_INPUT_ACCESSORY_ID : undefined
              }
              onChangeText={(nextPassword) => {
                setPassword(nextPassword);
                if (errorMessage) {
                  setErrorMessage(null);
                }
              }}
              onFocus={() => setActiveInput("password")}
              onSubmitEditing={dismissKeyboard}
              placeholder="Password"
              placeholderTextColor="rgba(255, 255, 255, 0.38)"
              ref={passwordInputRef}
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
          </View>

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.optionsRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              style={styles.rememberButton}
              onPress={withHaptic(() =>
                setRememberMe((current) => !current),
              )}
            >
              <View
                style={[
                  styles.checkbox,
                  rememberMe ? styles.checkboxChecked : null,
                ]}
              >
                {rememberMe ? (
                  <Ionicons name="checkmark" size={13} color="#14100b" />
                ) : null}
              </View>

              <Text style={styles.optionText}>Remember me</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              hitSlop={10}
              style={({ pressed }) => [
                styles.textButton,
                pressed ? styles.pressed : null,
              ]}
              onPress={withHaptic(onForgotPassword)}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log in"
            style={({ pressed }) => [
              styles.loginButton,
              pressed ? styles.loginButtonPressed : null,
            ]}
            onPress={withHaptic(handleCredentialLogin)}
          >
            <Text style={styles.loginButtonText}>Log In</Text>
          </Pressable>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log in with Apple"
            style={({ pressed }) => [
              styles.socialButton,
              pressed ? styles.socialButtonPressed : null,
            ]}
            onPress={withHaptic(handleSocialLogin)}
          >
            <Ionicons name="logo-apple" size={20} color="#ffffff" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log in with Google"
            style={({ pressed }) => [
              styles.socialButton,
              pressed ? styles.socialButtonPressed : null,
            ]}
            onPress={withHaptic(handleSocialLogin)}
          >
            <Ionicons name="logo-google" size={19} color="#ffffff" />
          </Pressable>
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Don't have an account?</Text>
          <Pressable
            hitSlop={20}
            style={({ pressed }) => [pressed ? styles.pressed : null]}
            onPress={withHaptic(onSignUp)}
          >
            <Text style={styles.registerButtonLabel}>Register!</Text>
          </Pressable>
        </View>
      </AuthPageLayout>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={LOGIN_INPUT_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <View style={styles.keyboardAccessoryNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to previous field"
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
                onPress={withHaptic(focusEmailInput)}
              >
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color={
                    activeInput === "password"
                      ? "#f7f5f1"
                      : "rgba(247, 245, 241, 0.34)"
                  }
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move to next field"
                disabled={activeInput !== "email"}
                style={({ pressed }) => [
                  styles.keyboardAccessoryButton,
                  activeInput !== "email"
                    ? styles.keyboardAccessoryButtonDisabled
                    : null,
                  pressed && activeInput === "email"
                    ? styles.keyboardAccessoryButtonPressed
                    : null,
                ]}
                onPress={withHaptic(focusPasswordInput)}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={
                    activeInput === "email"
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
        accessibilityLabel="Logging you in"
        label="Logging you in"
        visible={loginLoadingVisible}
        onHidden={handleLoginOverlayHidden}
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

  form: {
    gap: 18,
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

  errorText: {
    color: "#ff8a8a",
    fontFamily: "Ubuntu-Bold",
    fontSize: 12,
    lineHeight: 16,
    marginTop: -8,
    textAlign: "center",
  },

  optionsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },

  rememberButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
  },

  checkbox: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: 6,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },

  checkboxChecked: {
    backgroundColor: "#ff9d23",
    borderColor: "#ff9d23",
  },

  optionText: {
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: "Ubuntu-Medium",
    fontSize: 13,
  },

  textButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },

  forgotText: {
    color: "#ffb23d",
    fontFamily: "Ubuntu-Bold",
    fontSize: 13,
  },

  loginButton: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderColor: "rgba(255, 210, 139, 0.7)",
    borderRadius: 20,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    shadowColor: "#ff941f",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },

  loginButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },

  loginButtonText: {
    color: "#14100b",
    fontFamily: "Ubuntu-Bold",
    fontSize: 16,
  },

  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 20,
  },

  dividerLine: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    flex: 1,
    height: 1,
  },

  dividerText: {
    color: "rgba(255, 255, 255, 0.48)",
    fontFamily: "Ubuntu-Bold",
    fontSize: 12,
  },

  socialRow: {
    flexDirection: "row",
    gap: 44,
    justifyContent: "center",
  },

  socialButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 147, 31, 0.18)",
    borderColor: "rgba(255, 147, 31, 0.69)",
    borderRadius: 50,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center",
    width: 50,
  },

  socialButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },

  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },

  registerButtonLabel: {
    color: "#ff941f",
    fontFamily: "Ubuntu-Bold",
    paddingLeft: 4,
  },

  registerText: {
    color: "#6e6e6e",
    fontFamily: "Ubuntu",
    fontSize: 14,
  },

  pressed: {
    opacity: 0.7,
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
    gap: 4,
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
