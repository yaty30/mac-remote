import type { NavigatorScreenParams } from "@react-navigation/native";

export const ROUTES = {
  account: {
    forgotPassword: "ForgotPassword",
    login: "Login",
    signUp: "SignUp",
  },
  main: {
    remote: "Remote",
  },
  onboarding: {
    getStarted: "GetStarted",
  },
  root: {
    account: "Account",
    main: "Main",
    onboarding: "Onboarding",
  },
} as const;

export type AccountStackParamList = {
  [ROUTES.account.forgotPassword]: undefined;
  [ROUTES.account.login]: undefined;
  [ROUTES.account.signUp]: undefined;
};

export type MainStackParamList = {
  [ROUTES.main.remote]: undefined;
};

export type OnboardingStackParamList = {
  [ROUTES.onboarding.getStarted]: undefined;
};

export type RootStackParamList = {
  [ROUTES.root.account]: NavigatorScreenParams<AccountStackParamList>;
  [ROUTES.root.main]: NavigatorScreenParams<MainStackParamList>;
  [ROUTES.root.onboarding]: NavigatorScreenParams<OnboardingStackParamList>;
};
