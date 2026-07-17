import "react-native-gesture-handler";
import * as Font from "expo/node_modules/expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RemoteScreen } from "./screens/RemoteScreen";

const UBUNTU_FONT_FAMILY = "Ubuntu";

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

  if (!fontsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RemoteScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
