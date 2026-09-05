import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ForgotPasswordPage } from "../components/ForgotPasswordPage";
import { LoginPage } from "../components/LoginPage";
import { SignUpPage } from "../components/SignUpPage";
import type { AuthSignInInput } from "../features/auth/authSession";
import { useAuthSession } from "../features/auth/useAuthSession";
import {
  ROUTES,
  type AccountStackParamList,
} from "./navigationTypes";

const Stack = createNativeStackNavigator<AccountStackParamList>();

interface AccountNavigatorProps {
  onAuthenticated: () => Promise<void>;
  onExitAccountFlow: () => void;
}

export function AccountNavigator({
  onAuthenticated,
  onExitAccountFlow,
}: AccountNavigatorProps) {
  const { signIn } = useAuthSession();

  function handleLogin(input: AuthSignInInput) {
    void signIn(input)
      .then(onAuthenticated)
      .catch(() => undefined);
  }

  return (
    <Stack.Navigator
      initialRouteName={ROUTES.account.login}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name={ROUTES.account.login}>
        {({ navigation }) => (
          <LoginPage
            onBack={onExitAccountFlow}
            onForgotPassword={() =>
              navigation.navigate(ROUTES.account.forgotPassword)
            }
            onLogin={handleLogin}
            onSignUp={() => navigation.navigate(ROUTES.account.signUp)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name={ROUTES.account.forgotPassword}>
        {({ navigation }) => (
          <ForgotPasswordPage
            onBack={() => navigation.navigate(ROUTES.account.login)}
            onComplete={() => navigation.navigate(ROUTES.account.login)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name={ROUTES.account.signUp}>
        {({ navigation }) => (
          <SignUpPage
            onBack={() => navigation.navigate(ROUTES.account.login)}
            onComplete={(email) =>
              handleLogin({
                email,
                method: "signUp",
              })
            }
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
