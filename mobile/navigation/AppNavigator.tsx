import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AccountNavigator } from "./AccountNavigator";
import { FEATURES } from "./featureFlags";
import { MainNavigator } from "./MainNavigator";
import {
  getInitialAppFlow,
  isAccountFlowActive,
} from "./navigationState";
import {
  ROUTES,
  type RootStackParamList,
} from "./navigationTypes";
import { OnboardingNavigator } from "./OnboardingNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  onCompleteOnboarding: () => Promise<void>;
  onboardingCompleted: boolean;
}

export function AppNavigator({
  onCompleteOnboarding,
  onboardingCompleted,
}: AppNavigatorProps) {
  const initialAppFlow = getInitialAppFlow(onboardingCompleted);
  const accountFlowActive = isAccountFlowActive(
    FEATURES.accountAuthentication,
  );

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={
          initialAppFlow === "main"
            ? ROUTES.root.main
            : ROUTES.root.onboarding
        }
        screenOptions={{ headerShown: false }}
      >
        {onboardingCompleted ? (
          <Stack.Screen
            name={ROUTES.root.main}
            options={{ gestureEnabled: false }}
          >
            {() => <MainNavigator />}
          </Stack.Screen>
        ) : (
          <Stack.Screen
            name={ROUTES.root.onboarding}
            options={{ gestureEnabled: false }}
          >
            {() => (
              <OnboardingNavigator
                onCompleteOnboarding={onCompleteOnboarding}
              />
            )}
          </Stack.Screen>
        )}

        {accountFlowActive ? (
          <Stack.Screen name={ROUTES.root.account}>
            {({ navigation }) => (
              <AccountNavigator
                onAuthenticated={() => {
                  return onCompleteOnboarding().then(() => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: ROUTES.root.main }],
                    });
                  });
                }}
                onExitAccountFlow={() => {
                  navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
