import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";

interface HeaderProps {
  status: ConnectionStatus;
  onScan: () => void;
  showSettings?: boolean;
  onToggleSettings?: () => void;
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
  onScan,
  showSettings = false,
  onToggleSettings,
}: HeaderProps) {
  const connected = status === "connected";

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>iMac Remote</Text>
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

        <Pressable style={styles.connectButton} onPress={onToggleSettings}>
          <Text style={styles.connectText}>Settings</Text>
        </Pressable>

        <Pressable
          style={[styles.connectButton, connected && styles.liveButton]}
          onPress={connected ? undefined : onScan}
        >
          <Ionicons
            name={connected ? "checkmark" : "qr-code-outline"}
            size={20}
            color="#ffffff"
          />
          <Text style={styles.connectText}>
            {connected ? "Live" : "Scan"}
          </Text>
        </Pressable>
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
