import { Ionicons } from "@expo/vector-icons";
import {
  Monitor as MonitorIcon,
  MonitorX as MonitorOffIcon,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react-native";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";
import { useState, type ComponentType } from "react";
import { withHaptic } from "../utils/haptics";

interface HeaderProps {
  latencyMs?: number | null;
  status: ConnectionStatus;
  title?: string;
  onToggleSettings?: () => void;
  onSleep: () => void;
}

const statusLabels: Record<ConnectionStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Connecting",
};

const HeaderButtonGradient =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;

export function Header({
  latencyMs,
  status,
  title = "iMac Remote",
  onToggleSettings,
  onSleep,
}: HeaderProps) {
  const [sleep, setSleep] = useState(false);
  const monitorIsOn = !sleep;
  const latencyBand =
    status === "connected" && typeof latencyMs === "number"
      ? getLatencyBand(latencyMs)
      : null;
  const roundedLatencyMs =
    typeof latencyMs === "number" ? Math.round(latencyMs) : null;
  const LatencyIcon = latencyBand?.Icon;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.dot,
                status === "connected" ? styles.dotConnected : styles.dotIdle,
              ]}
            />
            <Text style={styles.status}>{statusLabels[status]}</Text>
            {latencyBand && LatencyIcon && roundedLatencyMs !== null ? (
              <View style={styles.latencyBadge}>
                <LatencyIcon
                  color={latencyBand.color}
                  size={12}
                  strokeWidth={2.5}
                />
                <Text style={[styles.latencyText, { color: latencyBand.color }]}>
                  {roundedLatencyMs}ms
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.headerActionButton,
              styles.settingsButton,
              pressed ? styles.headerActionButtonPressed : null,
            ]}
            onPress={withHaptic(onToggleSettings)}
          >
            <HeaderButtonGradient
              colors={["#f4b760", "#e2943b", "#c8762f"]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.headerActionGradient}
            >
              <Ionicons name="settings" size={20} color="#1b1008" />
            </HeaderButtonGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.headerActionButton,
              monitorIsOn ? styles.monitorOffButton : styles.monitorOnButton,
              pressed ? styles.headerActionButtonPressed : null,
            ]}
            onPress={withHaptic(() => {
              setSleep((s) => !s);
              onSleep();
            })}
          >
            <HeaderButtonGradient
              colors={
                monitorIsOn
                  ? ["#442019", "#2b1613", "#18100e"]
                  : ["#2b211a", "#1b1714", "#11100e"]
              }
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.headerActionGradient}
            >
              {monitorIsOn ? (
                <MonitorOffIcon size={21} color="#ff8a72" />
              ) : (
                <MonitorIcon size={21} color="#efe8dd" />
              )}
            </HeaderButtonGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function getLatencyBand(latencyMs: number) {
  if (latencyMs <= 50) {
    return {
      Icon: Signal,
      color: "#74f0a7",
    };
  }

  if (latencyMs <= 100) {
    return {
      Icon: SignalHigh,
      color: "#ffd166",
    };
  }

  if (latencyMs <= 150) {
    return {
      Icon: SignalMedium,
      color: "#ff941f",
    };
  }

  return {
    Icon: SignalLow,
    color: "#ff603c",
  };
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#f7f5f1",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  dot: {
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  dotConnected: {
    backgroundColor: "#74f0a7",
  },
  dotIdle: {
    backgroundColor: "#ff941f",
  },
  status: {
    color: "#a7a39d",
    fontSize: 13,
    fontWeight: "700",
  },
  latencyBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 24,
  },
  latencyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  headerActionButton: {
    alignItems: "center",
    backgroundColor: "#15120f",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    justifyContent: "center",
    minHeight: 52,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    width: 52,
  },
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  settingsButton: {
    borderColor: "#ffbf66",
  },
  monitorOffButton: {
    borderColor: "#713127",
  },
  monitorOnButton: {
    borderColor: "#4a3124",
  },
  headerActionGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
});
