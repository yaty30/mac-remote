import {
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../../types/protocol";

interface LatencyPillProps {
  latencyMs?: number | null;
  status: ConnectionStatus;
}

export function LatencyPill({ latencyMs, status }: LatencyPillProps) {
  const latencyBand =
    status === "connected" && typeof latencyMs === "number"
      ? getLatencyBand(latencyMs)
      : null;
  const roundedLatencyMs =
    typeof latencyMs === "number" ? Math.round(latencyMs) : null;
  const LatencyIcon = latencyBand?.Icon;

  if (!latencyBand || !LatencyIcon || roundedLatencyMs === null) {
    return null;
  }

  return (
    <View style={styles.infoLatencyPill}>
      <LatencyIcon color={latencyBand.color} size={12} strokeWidth={2.5} />
      <Text style={[styles.infoLatencyText, { color: latencyBand.color }]}>
        {roundedLatencyMs}ms
      </Text>
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
  infoLatencyPill: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 14,
    opacity: 0.8,
    paddingHorizontal: 4,
  },
  infoLatencyText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
