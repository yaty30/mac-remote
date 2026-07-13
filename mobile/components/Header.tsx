import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";
import { useState } from "react";
import { withHaptic } from "../utils/haptics";

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

export function Header({
  status,
  title = "iMac Remote",
  onToggleSettings,
  onSleep,
}: HeaderProps) {
  const [sleep, setSleep] = useState(false);

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
            style={styles.connectButton}
            onPress={withHaptic(onToggleSettings)}
          >
            <Ionicons name="settings" size={20} color="#1b1008" />
          </Pressable>

          <Pressable
            style={styles.sleepButton}
            onPress={withHaptic(() => {
              setSleep((s) => !s);
              onSleep();
            })}
          >
            <Ionicons
              name="power"
              size={20}
              color={sleep ? "#ff1111" : "#ffffff"}
            />
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
  sleepButton: {
    alignItems: "center",
    backgroundColor: "#3a2617",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
});
