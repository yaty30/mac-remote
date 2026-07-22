import { ArrowLeft } from "lucide-react-native";
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withHaptic } from "../utils/haptics";
import { FloatingIconOverlay } from "./FloatingIconOverlay";

interface AuthPageLayoutProps {
  animatedStyle?: Animated.WithAnimatedObject<ViewStyle>;
  children: React.ReactNode;
  contentGap?: number;
  contentMaxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
  onDismissKeyboard?: () => void;
  panHandlers?: GestureResponderHandlers;
  scrollable?: boolean;
  subtitle?: string;
  title?: string;
}

interface AuthBackButtonProps {
  accessibilityLabel: string;
  animatedStyle?: Animated.WithAnimatedObject<ViewStyle>;
  onPress: () => void;
}

export function AuthBackButton({
  accessibilityLabel,
  animatedStyle,
  onPress,
}: AuthBackButtonProps) {
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={12}
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.backButtonPressed : null,
        ]}
        onPress={withHaptic(onPress)}
      >
        <ArrowLeft size={23} color="#ffffff" strokeWidth={2.2} />
      </Pressable>
    </Animated.View>
  );
}

export function AuthPageLayout({
  animatedStyle,
  children,
  contentGap = 18,
  contentMaxWidth = 330,
  contentStyle,
  footer,
  headerLeft,
  headerRight,
  keyboardShouldPersistTaps = "handled",
  onDismissKeyboard,
  panHandlers,
  scrollable = false,
  subtitle,
  title,
}: AuthPageLayoutProps) {
  const dismissKeyboard = () => {
    Keyboard.dismiss();
    onDismissKeyboard?.();
  };
  const content = (
    <View
      pointerEvents="box-none"
      style={[
        styles.contentContainer,
        {
          gap: contentGap,
          maxWidth: contentMaxWidth,
        },
        contentStyle,
      ]}
    >
      {title || subtitle ? (
        <View style={styles.contentHeader}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={styles.screen}
        {...panHandlers}
      >
        <Pressable
          accessibilityLabel="Dismiss keyboard"
          style={styles.dismissPressable}
          onPress={dismissKeyboard}
        >
          <FloatingIconOverlay active maxOpacity={0.26} />

          <View pointerEvents="box-none" style={styles.header}>
            <View style={styles.headerSlot}>{headerLeft}</View>
            <View pointerEvents="none" style={styles.headerTitleSlot}>
              {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
            </View>
            <View style={styles.headerSlot}>{headerRight}</View>
          </View>

          <Animated.View
            pointerEvents="box-none"
            style={[styles.animatedContent, animatedStyle]}
          >
            {scrollable ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.scrollContent}
                keyboardDismissMode={
                  Platform.OS === "ios" ? "interactive" : "on-drag"
                }
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                showsVerticalScrollIndicator={false}
                style={styles.scrollView}
              >
                {content}
              </ScrollView>
            ) : (
              <View pointerEvents="box-none" style={styles.centerContent}>
                {content}
              </View>
            )}
          </Animated.View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Animated.View>
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

  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 44,
    left: 16,
    position: "absolute",
    right: 16,
    top: 8,
    zIndex: 3,
  },

  headerSlot: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 56,
  },

  headerTitleSlot: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },

  headerTitle: {
    color: "#ffffff",
    fontFamily: "Ubuntu-Bold",
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
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

  centerContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  contentContainer: {
    width: "100%",
  },

  contentHeader: {
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

  footer: {
    bottom: 24,
    left: 24,
    position: "absolute",
    right: 24,
    zIndex: 2,
  },
});
