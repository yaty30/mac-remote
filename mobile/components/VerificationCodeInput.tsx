import { useEffect, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const CODE_LENGTH = 6;

interface VerificationCodeInputProps {
  code: string;
  disabled?: boolean;
  error?: boolean;
  focusToken?: number;
  onChangeCode: (code: string) => void;
  onComplete?: (code: string) => void;
}

function sanitizeCode(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, CODE_LENGTH);
}

export function VerificationCodeInput({
  code,
  disabled = false,
  error = false,
  focusToken = 0,
  onChangeCode,
  onComplete,
}: VerificationCodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const focusedIndex = Math.min(code.length, CODE_LENGTH - 1);

  useEffect(() => {
    if (!disabled && focusToken > 0) {
      inputRef.current?.focus();
    }
  }, [disabled, focusToken]);

  const focusInput = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  const handleChangeText = (value: string) => {
    const nextCode = sanitizeCode(value);
    onChangeCode(nextCode);

    if (nextCode.length === CODE_LENGTH) {
      onComplete?.(nextCode);
    }
  };

  return (
    <Pressable
      accessibilityLabel="Confirmation code"
      accessibilityRole="button"
      disabled={disabled}
      style={styles.wrap}
      onPress={focusInput}
    >
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        caretHidden
        editable={!disabled}
        importantForAccessibility="no"
        keyboardType="ascii-capable"
        maxLength={CODE_LENGTH}
        onChangeText={handleChangeText}
        ref={inputRef}
        returnKeyType="done"
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        value={code}
      />

      <View style={styles.boxRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, index) => {
          const character = code[index] ?? "";
          const isFocused = !disabled && code.length === index;

          return (
            <View
              key={index}
              style={[
                styles.box,
                isFocused ? styles.boxFocused : null,
                error ? styles.boxError : null,
              ]}
            >
              <Text style={styles.boxText}>{character}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },

  hiddenInput: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },

  boxRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    width: "100%",
  },

  box: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "rgba(18, 17, 15, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 42,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    maxWidth: 48,
    minWidth: 36,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  boxFocused: {
    borderColor: "#ff9d23",
    shadowColor: "#ff9d23",
    shadowOpacity: 0.34,
  },

  boxError: {
    borderColor: "#ff8a8a",
  },

  boxText: {
    color: "#ffffff",
    fontFamily: "Ubuntu-Bold",
    fontSize: 18,
    lineHeight: 22,
    textAlign: "center",
  },
});
