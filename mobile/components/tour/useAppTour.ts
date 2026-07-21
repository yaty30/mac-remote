import { createContext, useContext } from "react";
import type { AppTourContextValue } from "./tourTypes";

export const AppTourContext = createContext<AppTourContextValue | null>(null);

export function useAppTour() {
  const context = useContext(AppTourContext);

  if (!context) {
    throw new Error("useAppTour must be used inside AppTourProvider");
  }

  return context;
}
