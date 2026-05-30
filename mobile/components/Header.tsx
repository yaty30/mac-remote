import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";

interface HeaderProps {
  host: string;
  status: ConnectionStatus;
  onHostChange: (host: string) => void;
  onConnect: () => void;
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
  host,
  status,
  onHostChange,
  onConnect,
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

        <Pressable style={styles.connectButton} onPress={onConnect}>
          <Ionicons
            name={connected ? "checkmark" : "wifi"}
            size={20}
            color="#ffffff"
          />
          <Text style={styles.connectText}>
            {connected ? "Live" : "Connect"}
          </Text>
        </Pressable>
      </View>

      {showSettings && (
        <TextInput
          value={host}
          onChangeText={onHostChange}
          placeholder="Mac IP address"
          placeholderTextColor="#68707f"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={onConnect}
        />
      )}
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
  connectText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#171a20",
    borderColor: "#262b35",
    borderRadius: 18,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    minHeight: 56,
    paddingHorizontal: 16,
  },
});
