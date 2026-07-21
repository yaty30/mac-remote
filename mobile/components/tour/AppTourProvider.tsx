import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { View } from "react-native";
import { TourOverlay } from "./TourOverlay";
import { getTourCompleted, setTourCompleted } from "./tourStorage";
import type { TourStep, TourTargetBounds } from "./tourTypes";
import { AppTourContext } from "./useAppTour";

interface AppTourProviderProps {
  children: ReactNode;
}

export function AppTourProvider({ children }: AppTourProviderProps) {
  const targetRefs = useRef(new Map<string, RefObject<View | null>>());
  const autoStartAttemptedRef = useRef(false);
  const stepRunRef = useRef(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [isTourVisible, setIsTourVisible] = useState(false);
  const [completionLoaded, setCompletionLoaded] = useState(false);
  const [tourWasCompleted, setTourWasCompleted] = useState(true);
  const [autoStartEnabled, setTourAutoStartEnabled] = useState(false);
  const [stepReadyVersion, setStepReadyVersion] = useState(0);
  const [isStepPreparing, setIsStepPreparing] = useState(false);
  const stepChangingRef = useRef(false);
  const activeStep = steps[currentStep];
  const activeStepId = activeStep?.id;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    let cancelled = false;

    getTourCompleted()
      .then((completed) => {
        if (!cancelled) {
          setTourWasCompleted(completed);
          setCompletionLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTourWasCompleted(false);
          setCompletionLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !completionLoaded ||
      tourWasCompleted ||
      autoStartAttemptedRef.current ||
      !autoStartEnabled ||
      steps.length === 0
    ) {
      return;
    }

    autoStartAttemptedRef.current = true;
    const timeout = setTimeout(() => {
      setCurrentStep(0);
      setIsTourVisible(true);
    }, 420);

    return () => clearTimeout(timeout);
  }, [autoStartEnabled, completionLoaded, steps.length, tourWasCompleted]);

  useEffect(() => {
    setCurrentStep((nextStep) => clamp(nextStep, 0, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  useEffect(() => {
    if (!isTourVisible || !activeStep) {
      return;
    }

    const runId = stepRunRef.current + 1;
    stepRunRef.current = runId;
    const stepForRun = activeStep;
    setIsStepPreparing(true);

    Promise.resolve(stepForRun.beforeShow?.())
      .catch(() => {
        // Tour setup should never trap the user on a broken step.
      })
      .finally(() => {
        const markReady = () => {
          if (stepRunRef.current === runId) {
            setIsStepPreparing(false);
            setStepReadyVersion((version) => version + 1);
          }
        };

        requestAnimationFrame(() => {
          setTimeout(markReady, 30);
        });
      });
  }, [activeStepId, currentStep, isTourVisible]);

  const registerTourTarget = useCallback(
    (targetKey: string, targetRef: RefObject<View | null>) => {
      targetRefs.current.set(targetKey, targetRef);

      return () => {
        const currentRef = targetRefs.current.get(targetKey);

        if (currentRef === targetRef) {
          targetRefs.current.delete(targetKey);
        }
      };
    },
    [],
  );

  const measureTourTarget = useCallback(
    (targetKey?: string): Promise<TourTargetBounds | null> =>
      new Promise((resolve) => {
        if (!targetKey) {
          resolve(null);
          return;
        }

        let attempt = 0;

        const measure = () => {
          const targetRef = targetRefs.current.get(targetKey);

          if (!targetRef?.current) {
            if (attempt < 8) {
              attempt += 1;
              setTimeout(measure, 80);
              return;
            }

            resolve(null);
            return;
          }

          requestAnimationFrame(() => {
            targetRef.current?.measureInWindow((x, y, width, height) => {
              if (width <= 0 || height <= 0) {
                if (attempt < 8) {
                  attempt += 1;
                  setTimeout(measure, 80);
                  return;
                }

                resolve(null);
                return;
              }

              resolve({ height, width, x, y });
            });
          });
        };

        measure();
      }),
    [],
  );

  const setTourSteps = useCallback((nextSteps: TourStep[]) => {
    setSteps((currentSteps) => {
      if (haveSameStepSignature(currentSteps, nextSteps)) {
        return currentSteps;
      }

      return nextSteps;
    });
  }, []);

  const runActiveStepExit = useCallback(async () => {
    await activeStep?.afterHide?.();
  }, [activeStep]);

  const handleNextStep = useCallback(() => {
    if (stepChangingRef.current) {
      return;
    }

    stepChangingRef.current = true;
    void runActiveStepExit()
      .catch(() => {
        // Cleanup should not block the user from continuing the tour.
      })
      .finally(() => {
        setCurrentStep((step) =>
          clamp(step + 1, 0, Math.max(steps.length - 1, 0)),
        );
        stepChangingRef.current = false;
      });
  }, [runActiveStepExit, steps.length]);

  const handlePreviousStep = useCallback(() => {
    if (stepChangingRef.current) {
      return;
    }

    stepChangingRef.current = true;
    void runActiveStepExit()
      .catch(() => {
        // Cleanup should not block the user from moving backward.
      })
      .finally(() => {
        setCurrentStep((step) =>
          clamp(step - 1, 0, Math.max(steps.length - 1, 0)),
        );
        stepChangingRef.current = false;
      });
  }, [runActiveStepExit, steps.length]);

  const closeAndPersistTour = useCallback(async () => {
    await runActiveStepExit().catch(() => {
      // Cleanup should not block tour dismissal.
    });
    setIsTourVisible(false);
    setTourWasCompleted(true);
    await setTourCompleted();
  }, [runActiveStepExit]);

  const handleSkipTour = useCallback(async () => {
    await closeAndPersistTour();
  }, [closeAndPersistTour]);

  const handleCompleteTour = useCallback(async () => {
    await closeAndPersistTour();
  }, [closeAndPersistTour]);

  const handleRestartTour = useCallback(() => {
    autoStartAttemptedRef.current = true;
    setCurrentStep(0);
    setIsTourVisible(true);
  }, []);

  const contextValue = useMemo(
    () => ({
      activeStep,
      currentStep,
      handleCompleteTour,
      handleNextStep,
      handlePreviousStep,
      handleRestartTour,
      handleSkipTour,
      isFirstStep,
      isLastStep,
      isTourVisible,
      measureTourTarget,
      registerTourTarget,
      setTourAutoStartEnabled,
      setTourSteps,
      steps,
      stepReadyVersion,
    }),
    [
      activeStep,
      currentStep,
      handleCompleteTour,
      handleNextStep,
      handlePreviousStep,
      handleRestartTour,
      handleSkipTour,
      isFirstStep,
      isLastStep,
      isTourVisible,
      measureTourTarget,
      registerTourTarget,
      setTourSteps,
      steps,
      stepReadyVersion,
    ],
  );

  return (
    <AppTourContext.Provider value={contextValue}>
      {children}
      <TourOverlay
        activeStep={activeStep}
        currentStep={currentStep}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isVisible={isTourVisible && !isStepPreparing}
        measureTourTarget={measureTourTarget}
        onComplete={() => {
          void handleCompleteTour();
        }}
        onNext={handleNextStep}
        onPrevious={handlePreviousStep}
        onSkip={() => {
          void handleSkipTour();
        }}
        stepReadyVersion={stepReadyVersion}
        totalSteps={steps.length}
      />
    </AppTourContext.Provider>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function haveSameStepSignature(
  currentSteps: TourStep[],
  nextSteps: TourStep[],
): boolean {
  if (currentSteps.length !== nextSteps.length) {
    return false;
  }

  return currentSteps.every((step, index) => {
    const nextStep = nextSteps[index];

    return (
      step.id === nextStep.id &&
      step.targetKey === nextStep.targetKey &&
      step.title === nextStep.title &&
      step.description === nextStep.description &&
      step.placement === nextStep.placement &&
      step.features?.join("\n") === nextStep.features?.join("\n")
    );
  });
}
