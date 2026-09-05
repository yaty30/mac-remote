import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";
import { useAppTour } from "./useAppTour";

interface TourTargetProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  targetKey: string;
}

export function TourTarget({ children, style, targetKey }: TourTargetProps) {
  const targetRef = useRef<View>(null);
  const { registerTourTarget } = useAppTour();

  useEffect(
    () => registerTourTarget(targetKey, targetRef),
    [registerTourTarget, targetKey],
  );

  return (
    <View
      ref={targetRef}
      collapsable={false}
      style={[styles.target, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: 0,
    minWidth: 0,
  },
});
