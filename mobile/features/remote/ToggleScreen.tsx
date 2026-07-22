import { Monitor as MonitorIcon, MonitorX as MonitorOffIcon } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { HeaderGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";

interface ToggleScreenProps {
  onSleep?: () => void;
}

export function ToggleScreen({ onSleep }: ToggleScreenProps) {
  const [sleep, setSleep] = useState(false);
  const monitorIsOn = !sleep;

  return (
    <TourTarget targetKey="sleep-control">
      <HeaderGradientButton
        accessibilityLabel={monitorIsOn ? "Lock or sleep computer" : "Wake computer"}
        action={() => {
          if (!onSleep) {
            return;
          }

          setSleep((current) => !current);
          onSleep();
        }}
        buttonStyle={[
          styles.headerActionButton,
          monitorIsOn ? styles.monitorOffButton : styles.monitorOnButton,
        ]}
        colors={
          monitorIsOn
            ? ["#442019", "#2b1613", "#18100e"]
            : ["#2b211a", "#1b1714", "#11100e"]
        }
        disabled={!onSleep}
        disabledStyle={styles.headerActionButtonDisabled}
        end={{ x: 0.82, y: 1 }}
        gradientStyle={styles.headerActionGradient}
        icon={
          monitorIsOn ? (
            <MonitorOffIcon size={21} color="#ff8a72" />
          ) : (
            <MonitorIcon size={21} color="#efe8dd" />
          )
        }
        pressedStyle={styles.headerActionButtonPressed}
        start={{ x: 0.18, y: 0 }}
      />
    </TourTarget>
  );
}

const styles = StyleSheet.create({
  headerActionButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    justifyContent: "center",
    minHeight: 52,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    width: 52,
  },
  headerActionButtonDisabled: {
    opacity: 0.45,
  },
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  headerActionGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  monitorOffButton: {
    borderColor: "rgba(255, 87, 72, 0.48)",
  },
  monitorOnButton: {
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
});
