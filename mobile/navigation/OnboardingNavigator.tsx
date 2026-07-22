import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { GetStartedScreen } from "../screens/GetStartedScreen";
import { FEATURES } from "./featureFlags";
import {
  ROUTES,
  type OnboardingStackParamList,
  type RootStackParamList,
} from "./navigationTypes";

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

interface OnboardingNavigatorProps {
  onCompleteOnboarding: () => Promise<void>;
}

export function OnboardingNavigator({
  onCompleteOnboarding,
}: OnboardingNavigatorProps) {
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Stack.Navigator
      initialRouteName={ROUTES.onboarding.getStarted}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name={ROUTES.onboarding.getStarted}
        options={{ gestureEnabled: false }}
      >
        {() => (
          <GetStartedScreen
            onComplete={() => {
              void onCompleteOnboarding();
            }}
            onLogin={() => {
              if (FEATURES.accountAuthentication) {
                rootNavigation.navigate(ROUTES.root.account, {
                  screen: ROUTES.account.login,
                });
              }
            }}
            showLoginShortcut={FEATURES.accountAuthentication}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
