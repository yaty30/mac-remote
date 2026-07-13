import { Ionicons } from "@expo/vector-icons";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";
import { useState, type ComponentType } from "react";
import { withHaptic } from "../utils/haptics";
import MonitorIcon from "../assets/icons/monitor.svg";
import MonitorOffIcon from "../assets/icons/monitor-off.svg";

interface HeaderProps {
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
  status,
  title = "iMac Remote",
  onToggleSettings,
  onSleep,
}: HeaderProps) {
  const [sleep, setSleep] = useState(false);
  const monitorIsOn = !sleep;

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
                <MonitorOffIcon width={21} height={21} color="#ff8a72" />
              ) : (
                <MonitorIcon width={21} height={21} color="#efe8dd" />
              )}
            </HeaderButtonGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
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
