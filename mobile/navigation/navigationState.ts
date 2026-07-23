export type AppFlow = "main" | "onboarding";

interface NavigationReadinessInput {
  fontsReady: boolean;
  onboardingStateResolved: boolean;
}

export function parseStoredOnboardingCompleted(
  storedValue: string | null,
): boolean {
  return storedValue === "true";
}

export function getInitialAppFlow(onboardingCompleted: boolean): AppFlow {
  return onboardingCompleted ? "main" : "onboarding";
}

export function getAppFlowAfterOnboardingCompleted(): AppFlow {
  return "main";
}

export function shouldRenderNavigation({
  fontsReady,
  onboardingStateResolved,
}: NavigationReadinessInput): boolean {
  return fontsReady && onboardingStateResolved;
}

export function isAccountFlowActive(accountAuthenticationEnabled: boolean) {
  return accountAuthenticationEnabled;
}
