import type { RefObject } from "react";
import type { View } from "react-native";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  features?: string[];
  targetRef?: RefObject<View | null>;
  targetKey?: string;
  placement?: TourPlacement;
  screen?: string;
  beforeShow?: () => void | Promise<void>;
  afterHide?: () => void | Promise<void>;
}

export interface TourTargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppTourContextValue {
  activeStep?: TourStep;
  currentStep: number;
  handleCompleteTour: () => Promise<void>;
  handleNextStep: () => void;
  handlePreviousStep: () => void;
  handleRestartTour: () => void;
  handleSkipTour: () => Promise<void>;
  isFirstStep: boolean;
  isLastStep: boolean;
  isTourVisible: boolean;
  measureTourTarget: (targetKey?: string) => Promise<TourTargetBounds | null>;
  registerTourTarget: (
    targetKey: string,
    targetRef: RefObject<View | null>,
  ) => () => void;
  setTourAutoStartEnabled: (isEnabled: boolean) => void;
  setTourSteps: (steps: TourStep[]) => void;
  steps: TourStep[];
  stepReadyVersion: number;
}
