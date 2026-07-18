import { Ionicons } from "@expo/vector-icons";
import {
  Monitor as MonitorIcon,
  MonitorX as MonitorOffIcon,
} from "lucide-react-native";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "../types/protocol";
import { useState, type ComponentType, type ReactNode } from "react";
import { withHaptic } from "../utils/haptics";

interface HeaderProps {
  latencyMs?: number | null;
  status: ConnectionStatus;
  title?: string;
  titleContent?: ReactNode;
  onScan?: () => void;
  onToggleSettings?: () => void;
  settingsDisabled?: boolean;
  onSleep?: () => void;
}

const HeaderButtonGradient =
  ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;

export function Header({
  title = "Remote Control",
  titleContent,
  onScan,
  onToggleSettings,
  settingsDisabled = false,
  onSleep,
}: HeaderProps) {
  const [sleep, setSleep] = useState(false);
  const monitorIsOn = !sleep;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          {titleContent ?? (
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              {title}
            </Text>
          )}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.headerActionButton,
              styles.scanButton,
              pressed ? styles.headerActionButtonPressed : null,
            ]}
            onPress={withHaptic(onScan)}
          >
            <HeaderButtonGradient
              colors={["rgba(44, 33, 23, 0.72)", "rgba(24, 20, 16, 0.72)", "rgba(14, 13, 11, 0.72)"]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.headerActionGradient}
            >
              <Ionicons name="qr-code-outline" size={20} color="#f0a942" />
            </HeaderButtonGradient>
          </Pressable>

          <Pressable
            disabled={settingsDisabled || !onToggleSettings}
            style={({ pressed }) => [
              styles.headerActionButton,
              styles.settingsButton,
              pressed && !settingsDisabled && onToggleSettings
                ? styles.headerActionButtonPressed
                : null,
              settingsDisabled || !onToggleSettings
                ? styles.headerActionButtonDisabled
                : null,
            ]}
            onPress={withHaptic(onToggleSettings)}
          >
            <HeaderButtonGradient
              colors={["rgba(44, 33, 23, 0.72)", "rgba(24, 20, 16, 0.72)", "rgba(14, 13, 11, 0.72)"]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.headerActionGradient}
            >
              <Ionicons name="settings" size={20} color="#f0a942" />
            </HeaderButtonGradient>
          </Pressable>

          <Pressable
            disabled={!onSleep}
            style={({ pressed }) => [
              styles.headerActionButton,
              monitorIsOn ? styles.monitorOffButton : styles.monitorOnButton,
              pressed && onSleep ? styles.headerActionButtonPressed : null,
              !onSleep ? styles.headerActionButtonDisabled : null,
            ]}
            onPress={withHaptic(() => {
              if (!onSleep) {
                return;
              }

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

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
    zIndex: 50,
    elevation: 50,
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
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  headerActionButtonDisabled: {
    opacity: 0.45,
  },
  settingsButton: {
    borderColor: "rgba(240, 169, 66, 0.42)",
  },
  scanButton: {
    borderColor: "rgba(240, 169, 66, 0.42)",
  },
  monitorOffButton: {
    borderColor: "rgba(255, 87, 72, 0.48)",
  },
  monitorOnButton: {
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  headerActionGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
});
