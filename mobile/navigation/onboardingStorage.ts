import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { parseStoredOnboardingCompleted } from "./navigationState";

const ONBOARDING_COMPLETED_STORAGE_KEY =
  "mac_remote_mobile_onboarding_completed";
const ONBOARDING_COMPLETED_STORAGE_VALUE = "true";

export function useOnboardingCompletion() {
  const [completed, setCompleted] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY)
      .then((storedValue) => {
        if (cancelled) {
          return;
        }

        setCompleted(parseStoredOnboardingCompleted(storedValue));
      })
      .catch(() => {
        if (!cancelled) {
          setCompleted(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(
      ONBOARDING_COMPLETED_STORAGE_KEY,
      ONBOARDING_COMPLETED_STORAGE_VALUE,
    );
    setCompleted(true);
  }, []);

  return {
    completeOnboarding,
    onboardingCompleted: completed,
    onboardingStateResolved: resolved,
  };
}
