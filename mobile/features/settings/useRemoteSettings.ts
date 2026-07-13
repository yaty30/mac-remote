import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  DEFAULT_SENSITIVITY,
  SENSITIVITY_STORAGE_KEY,
  UNNATURAL_SCROLLING_STORAGE_KEY,
} from "./constants";

export function useRemoteSettings() {
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [unnaturalScrolling, setUnnaturalScrolling] = useState(false);
  const [scrollingPreferenceLoaded, setScrollingPreferenceLoaded] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(SENSITIVITY_STORAGE_KEY),
      AsyncStorage.getItem(UNNATURAL_SCROLLING_STORAGE_KEY),
    ])
      .then(([savedSensitivity, savedUnnaturalScrolling]) => {
        if (cancelled) {
          return;
        }

        const parsed = Number.parseFloat(savedSensitivity ?? "");
        if (Number.isFinite(parsed)) {
          setSensitivity(Math.max(0.25, Math.min(3, parsed)));
        }

        if (savedUnnaturalScrolling !== null) {
          setUnnaturalScrolling(savedUnnaturalScrolling === "true");
        }
      })
      .catch(() => {
        // Ignore storage errors.
      })
      .finally(() => {
        if (!cancelled) {
          setScrollingPreferenceLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SENSITIVITY_STORAGE_KEY, String(sensitivity)).catch(
      () => {
        // Ignore storage errors.
      },
    );
  }, [sensitivity]);

  useEffect(() => {
    if (!scrollingPreferenceLoaded) {
      return;
    }

    AsyncStorage.setItem(
      UNNATURAL_SCROLLING_STORAGE_KEY,
      String(unnaturalScrolling),
    ).catch(() => {
      // Ignore storage errors.
    });
  }, [scrollingPreferenceLoaded, unnaturalScrolling]);

  function adjustSensitivity(delta: number) {
    setSensitivity((current) => {
      const next = Math.max(0.25, Math.min(3, current + delta));
      return Math.round(next * 100) / 100;
    });
  }

  return {
    adjustSensitivity,
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling,
  };
}
