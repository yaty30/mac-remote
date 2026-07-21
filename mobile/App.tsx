import "react-native-gesture-handler";
import * as Font from "expo/node_modules/expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppSplashOverlay } from "./components/AppSplashOverlay";
import { ForgotPasswordPage } from "./components/ForgotPasswordPage";
import { LoginPage } from "./components/LoginPage";
import { SignUpPage } from "./components/SignUpPage";
import { GetStartedScreen } from "./screens/GetStartedScreen";
import { RemoteScreen } from "./screens/RemoteScreen";

const UBUNTU_FONT_FAMILY = "Ubuntu";
const APP_SPLASH_MIN_DURATION_MS = 950;
type ActiveScreen =
  | "forgotPassword"
  | "getStarted"
  | "login"
  | "remote"
  | "signUp";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The native splash may already be hidden during development reloads.
});

function applyDefaultFont() {
  const defaultTextProps = (Text as unknown as { defaultProps?: TextProps });
  const defaultTextInputProps = TextInput as unknown as {
    defaultProps?: TextInputProps;
  };

  defaultTextProps.defaultProps = {
    ...defaultTextProps.defaultProps,
    style: [
      defaultTextProps.defaultProps?.style,
      { fontFamily: UBUNTU_FONT_FAMILY },
    ],
  };
  defaultTextInputProps.defaultProps = {
    ...defaultTextInputProps.defaultProps,
    style: [
      defaultTextInputProps.defaultProps?.style,
      { fontFamily: UBUNTU_FONT_FAMILY },
    ],
  };
}

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);
  const [appSplashVisible, setAppSplashVisible] = useState(true);
  const [activeScreen, setActiveScreen] =
    useState<ActiveScreen>("getStarted");
  const [getStartedInitialPage, setGetStartedInitialPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Font.loadAsync({
      Ubuntu: require("../assets/fonts/Ubuntu/Ubuntu-Regular.ttf"),
      "Ubuntu-Bold": require("../assets/fonts/Ubuntu/Ubuntu-Bold.ttf"),
      "Ubuntu-Medium": require("../assets/fonts/Ubuntu/Ubuntu-Medium.ttf"),
      "Ubuntu-Light": require("../assets/fonts/Ubuntu/Ubuntu-Light.ttf"),
    })
      .then(() => {
        if (!cancelled) {
          applyDefaultFont();
          setFontsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fontsReady) {
      return;
    }

    void SplashScreen.hideAsync().catch(() => {
      // Ignore if the native splash is already hidden.
    });

    const splashTimer = setTimeout(() => {
      setAppSplashVisible(false);
    }, APP_SPLASH_MIN_DURATION_MS);

    return () => {
      clearTimeout(splashTimer);
    };
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={styles.appRoot}>
          <StatusBar style="light" />
          {activeScreen === "getStarted" ? (
            <GetStartedScreen
              initialPage={getStartedInitialPage}
              onComplete={(fromPage) => {
                setGetStartedInitialPage(fromPage);
                setActiveScreen("login");
              }}
              onLogin={(fromPage) => {
                setGetStartedInitialPage(fromPage);
                setActiveScreen("login");
              }}
            />
          ) : null}
          {activeScreen === "login" ? (
            <LoginPage
              onBack={() => setActiveScreen("getStarted")}
              onForgotPassword={() => setActiveScreen("forgotPassword")}
              onLogin={() => setActiveScreen("remote")}
              onSignUp={() => setActiveScreen("signUp")}
            />
          ) : null}
          {activeScreen === "forgotPassword" ? (
            <ForgotPasswordPage
              onBack={() => setActiveScreen("login")}
              onComplete={() => setActiveScreen("login")}
            />
          ) : null}
          {activeScreen === "signUp" ? (
            <SignUpPage
              onBack={() => setActiveScreen("login")}
              onComplete={() => setActiveScreen("remote")}
            />
          ) : null}
          {activeScreen === "remote" ? (
            <RemoteScreen showInitialSplash={false} />
          ) : null}
          <AppSplashOverlay visible={appSplashVisible} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    backgroundColor: "#070707",
    flex: 1,
  },
});
