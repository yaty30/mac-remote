import { Ionicons } from "@expo/vector-icons";
import { StarCheck } from "lucide-react-native";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScanGradientButton } from "../GradientButton";
import type { TourStep } from "./tourTypes";

interface TourTooltipProps {
  animatedStyle: object;
  currentStep: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  onComplete: () => void;
  onLayout: (height: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  step: TourStep;
  totalSteps: number;
}

const PRIMARY_GRADIENT = [
  "rgba(44, 33, 23, 0.72)",
  "rgba(24, 20, 16, 0.72)",
  "rgba(14, 13, 11, 0.72)",
] as const;

const SECONDARY_GRADIENT = [
  "rgba(31, 30, 28, 0.72)",
  "rgba(16, 15, 15, 0.72)",
  "rgba(6, 6, 6, 0.72)",
] as const;

const GRADIENT_START = { x: 0.1, y: 0 };
const GRADIENT_END = { x: 0.9, y: 1 };

export function TourTooltip({
  animatedStyle,
  currentStep,
  isFirstStep,
  isLastStep,
  onComplete,
  onLayout,
  onNext,
  onPrevious,
  onSkip,
  step,
  totalSteps,
}: TourTooltipProps) {
  const nextLabel = isLastStep ? "Finish" : "Next";
  const nextAction = isLastStep ? onComplete : onNext;
  const nextIcon = isLastStep ? "checkmark" : "chevron-forward";

  return (
    <Animated.View
      accessibilityLabel={`Tour step ${currentStep + 1} of ${totalSteps}. ${step.title}. ${step.description}`}
      accessibilityRole="summary"
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={[styles.card, animatedStyle]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.stepCount}>
          {currentStep + 1} of {totalSteps}
        </Text>

        <Pressable
          accessibilityLabel="Skip app tour"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && styles.skipButtonPressed,
          ]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View
        accessibilityElementsHidden
        style={styles.progressRow}
      >
        {Array.from({ length: totalSteps }).map((_, index) => (
          <View
            key={`${step.id}-${index}`}
            style={[
              styles.progressDot,
              index < currentStep && styles.progressDotComplete,
              index === currentStep && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <Text
        maxFontSizeMultiplier={1.35}
        style={styles.title}
      >
        {step.title}
      </Text>

      <Text
        maxFontSizeMultiplier={1.35}
        style={styles.description}
      >
        {step.description}
      </Text>

      {!!step.features?.length && (
        <View style={styles.featureList}>
          {step.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <StarCheck
                color="#f0a942"
                size={16}
                style={styles.featureIcon}
              />

              <Text
                maxFontSizeMultiplier={1.3}
                style={styles.featureText}
              >
                {feature}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        {!isFirstStep ? (
          <ScanGradientButton
            accessibilityLabel="Previous tour step"
            action={onPrevious}
            buttonStyle={[
              styles.actionButton,
              styles.secondaryButton,
            ]}
            colors={SECONDARY_GRADIENT}
            end={GRADIENT_END}
            gradientStyle={styles.actionButtonContent}
            icon={
              <Ionicons
                color="#777572"
                name="chevron-back"
                size={18}
              />
            }
            iconPosition="left"
            label="Back"
            labelStyle={[
              styles.actionButtonText,
              styles.secondaryButtonText,
            ]}
            pressedStyle={styles.buttonPressed}
            start={GRADIENT_START}
          />
        ) : (
          <View style={styles.actionSpacer} />
        )}

        <ScanGradientButton
          accessibilityLabel={
            isLastStep ? "Finish app tour" : "Next tour step"
          }
          action={nextAction}
          buttonStyle={[
            styles.actionButton,
            styles.primaryButton,
          ]}
          colors={PRIMARY_GRADIENT}
          end={GRADIENT_END}
          gradientStyle={styles.actionButtonContent}
          icon={
            <Ionicons
              color="#f0a942"
              name={nextIcon}
              size={18}
            />
          }
          iconPosition="right"
          label={nextLabel}
          labelStyle={[
            styles.actionButtonText,
            styles.primaryButtonText,
          ]}
          pressedStyle={styles.buttonPressed}
          start={GRADIENT_START}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    gap: 10,
    padding: 16,
    backgroundColor: "rgba(18, 17, 15, 0.97)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 28,
  },

  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  stepCount: {
    color: "#f0a942",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  skipButton: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  skipButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  skipText: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "900",
  },

  progressRow: {
    flexDirection: "row",
    gap: 4,
  },

  progressDot: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 3,
  },

  progressDotActive: {
    backgroundColor: "#f0a942",
  },

  progressDotComplete: {
    backgroundColor: "rgba(222, 157, 60, 0.54)",
  },

  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },

  description: {
    color: "#d8d0c5",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },

  featureList: {
    gap: 7,
  },

  featureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },

  featureIcon: {
    marginTop: 1,
  },

  featureText: {
    flex: 1,
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },

  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },

  actionSpacer: {
    flex: 1,
    minWidth: 0,
  },

  actionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },

  actionButtonContent: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },

  actionButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },

  primaryButton: {
    backgroundColor: "rgba(31, 25, 18, 0.82)",
    borderColor: "rgba(240, 169, 66, 0.62)",
  },

  primaryButtonText: {
    color: "#f0a942",
  },

  secondaryButton: {
    backgroundColor: "rgba(20, 20, 19, 0.82)",
    borderColor: "rgba(110, 107, 103, 0.42)",
  },

  secondaryButtonText: {
    color: "#777572",
  },

  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
});