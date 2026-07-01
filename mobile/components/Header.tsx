import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";
import { useState } from "react";
import { withHaptic } from "../utils/haptics";

interface HeaderProps {
  status: ConnectionStatus;
  title?: string;
  onScan: () => void;
  showSettings?: boolean;
  onToggleSettings?: () => void;
  onSleep: () => void;
}

const statusLabels: Record<ConnectionStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Connection error",
};

export function Header({
  status,
  title = "iMac Remote",
  onScan,
  showSettings = false,
  onToggleSettings,
  onSleep,
}: HeaderProps) {
  const connected = status === "connected";
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
                connected ? styles.dotConnected : styles.dotIdle,
              ]}
            />
            <Text style={styles.status}>{statusLabels[status]}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.connectButton, connected && styles.liveButton]}
            onPress={connected ? undefined : withHaptic(onScan)}
          >
            <Ionicons
              name={connected ? "thumbs-up" : "qr-code-outline"}
              size={20}
              color="#ffffff"
            />
          </Pressable>

          <Pressable
            style={styles.connectButton}
            onPress={withHaptic(onToggleSettings)}
          >
            <Ionicons name="settings" size={20} color="#ffffff" />
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
    color: "#f8fafc",
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
    backgroundColor: "#f0c674",
  },
  status: {
    color: "#a5afbf",
    fontSize: 13,
    fontWeight: "700",
  },
  sleepButton: {
    alignItems: "center",
    backgroundColor: "#342b57",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#2f6df6",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  liveButton: {
    backgroundColor: "#1b7f49",
  },
  connectText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
});
