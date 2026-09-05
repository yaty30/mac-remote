import { Pressable, StyleSheet, Text, View } from "react-native";
import { withHaptic } from "../utils/haptics";
import { VerificationCodeInput } from "./VerificationCodeInput";

interface AuthVerificationStepProps {
  code: string;
  email: string;
  error?: string | null;
  focusToken: number;
  isResending: boolean;
  onChangeCode: (code: string) => void;
  onComplete: (code: string) => void;
  onResend: () => void;
  resendFeedback?: string | null;
  resendSeconds: number;
  verificationDisabled?: boolean;
}

export function AuthVerificationStep({
  code,
  email,
  error,
  focusToken,
  isResending,
  onChangeCode,
  onComplete,
  onResend,
  resendFeedback,
  resendSeconds,
  verificationDisabled = false,
}: AuthVerificationStepProps) {
  const resendDisabled = resendSeconds > 0 || isResending;

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Check Your Email</Text>
        <Text style={styles.subtitle}>
          Enter the 6-character code sent to
        </Text>
        <Text style={styles.emailText} numberOfLines={1}>
          {email}
        </Text>
      </View>

      <View style={styles.verificationContent}>
        <VerificationCodeInput
          code={code}
          disabled={verificationDisabled}
          error={Boolean(error)}
          focusToken={focusToken}
          onChangeCode={onChangeCode}
          onComplete={onComplete}
        />

        {error ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
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
            pressed && !resendDisabled ? styles.resendButtonPressed : null,
          ]}
          onPress={withHaptic(onResend)}
        >
          <Text
            style={[
              styles.resendButtonText,
              resendDisabled ? styles.resendButtonTextDisabled : null,
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

  emailText: {
    color: "#ffb23d",
    fontFamily: "Ubuntu-Bold",
    fontSize: 14,
    marginVertical: 24,
    maxWidth: "100%",
    textAlign: "center",
  },

  verificationContent: {
    alignItems: "center",
    gap: 14,
    width: "100%",
  },

  errorText: {
    color: "#ff8a8a",
    fontFamily: "Ubuntu-Bold",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
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
});
