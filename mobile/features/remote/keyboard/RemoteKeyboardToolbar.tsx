import { Ionicons } from "@expo/vector-icons";
import { Keyboard as KeyboardIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScanGradientButton } from "../../../components/GradientButton";
import type { TextCommand } from "../../../types/protocol";

interface RemoteKeyboardToolbarProps {
  buttonWidthStyle: object;
  onInsertNewLine: () => void;
  onPasteFromPhone: () => void;
  onShortcut: (command: TextCommand) => void;
}

export function RemoteKeyboardToolbar({
  buttonWidthStyle,
  onInsertNewLine,
  onPasteFromPhone,
  onShortcut,
}: RemoteKeyboardToolbarProps) {
  return (
    <View style={styles.keyboardShortcutGrid}>
      <KeyboardShortcutButton
        action={() => onShortcut("selectAll")}
        icon={<Ionicons name="scan-outline" size={18} color="#f0c17c" />}
        label="Select All"
        widthStyle={buttonWidthStyle}
      />
      <KeyboardShortcutButton
        action={onInsertNewLine}
        icon={
          <Ionicons
            name="return-down-forward-outline"
            size={18}
            color="#f0c17c"
          />
        }
        label="New Line"
        widthStyle={buttonWidthStyle}
      />
      <KeyboardShortcutButton
        action={() => onShortcut("copy")}
        icon={<Ionicons name="copy-outline" size={18} color="#f0c17c" />}
        label="Copy"
        widthStyle={buttonWidthStyle}
      />
      <KeyboardShortcutButton
        action={() => onShortcut("paste")}
        icon={<Ionicons name="clipboard-outline" size={18} color="#f0c17c" />}
        label="Paste"
        widthStyle={buttonWidthStyle}
      />
      <KeyboardShortcutButton
        action={onPasteFromPhone}
        colors={["#3b2816", "#211811", "#11100e"]}
        icon={
          <Ionicons name="phone-portrait-outline" size={18} color="#f0a942" />
        }
        label="Paste Phone"
        widthStyle={buttonWidthStyle}
      />
      <KeyboardShortcutButton
        action={() => onShortcut("clear")}
        colors={["#342019", "#211613", "#11100e"]}
        icon={<Ionicons name="backspace-outline" size={18} color="#ffb08a" />}
        label="Clear"
        widthStyle={buttonWidthStyle}
      />
    </View>
  );
}

export function RemoteKeyboardHeader({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.keyboardPanelHeader}>
      <View style={styles.keyboardPanelTitleRow}>
        <View style={styles.keyboardPanelIcon}>
          <View style={styles.keyboardPanelIconGradient}>
            <KeyboardIcon size={18} color="#f0a942" />
          </View>
        </View>
        <Text style={styles.keyboardPanelTitle}>Keyboard</Text>
      </View>
      <ScanGradientButton
        accessibilityLabel="Close keyboard panel"
        action={onClose}
        buttonStyle={styles.keyboardPanelClose}
        colors={["#4b211c", "#321917", "#1b1110"]}
        gradientStyle={styles.keyboardPanelCloseGradient}
        icon={<Ionicons name="close" size={20} color="#ff8a72" />}
        pressedStyle={styles.keyboardPanelClosePressed}
      />
    </View>
  );
}

function KeyboardShortcutButton({
  action,
  colors = ["#2b211a", "#1b1714", "#11100e"],
  icon,
  label,
  widthStyle,
}: {
  action: () => void;
  colors?: [string, string, string];
  icon: ReactNode;
  label: string;
  widthStyle: object;
}) {
  return (
    <ScanGradientButton
      action={action}
      buttonStyle={[styles.keyboardShortcutButton, widthStyle]}
      colors={colors}
      gradientStyle={styles.keyboardShortcutGradient}
      icon={icon}
      label={label}
      labelStyle={styles.keyboardShortcutText}
      pressedStyle={styles.keyboardShortcutButtonPressed}
    />
  );
}

const styles = StyleSheet.create({
  keyboardPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  keyboardPanelTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  keyboardPanelIcon: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "rgba(240, 169, 66, 0.5)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 4,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#f0a942",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    width: 32,
  },
  keyboardPanelIconGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  keyboardPanelTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  keyboardPanelClose: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "rgba(255, 138, 114, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 4,
    height: 36,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    width: 36,
  },
  keyboardPanelCloseGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  keyboardPanelClosePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  keyboardShortcutGrid: {
    flexDirection: "row",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 8,
  },
  keyboardShortcutButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(240, 169, 66, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  keyboardShortcutGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    gap: 5,
    justifyContent: "center",
    paddingHorizontal: 4,
    width: "100%",
  },
  keyboardShortcutButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  keyboardShortcutText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
});
