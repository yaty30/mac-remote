import {
  ClockArrowLeft as ClockArrowLeftIcon,
  ClockArrowRight as ClockArrowRightIcon,
  Minimize2 as Minimize2Icon,
  PanelRightClose as PanelRightCloseIcon,
  PanelRightOpen as PanelRightOpenIcon,
  SquareX as SquareXIcon,
  Undo2,
  Redo2,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { TourTarget } from "../../components/tour/TourTarget";
import { withHaptic } from "../../utils/haptics";

const BODY_HORIZONTAL_PADDING = 10;

interface ControlActionButtonsProps {
  isWindowsHost: boolean;
  onBrowserBack: () => void;
  onBrowserForward: () => void;
  onCloseTab: () => void;
  onEscape: () => void;
  onLeftArrow: () => void;
  onPrimarySwitch: (direction: "left" | "right") => void;
  onRightArrow: () => void;
  primarySwitchAvailable: boolean;
}

export function ControlActionButtons({
  isWindowsHost,
  onBrowserBack,
  onBrowserForward,
  onCloseTab,
  onEscape,
  onLeftArrow,
  onPrimarySwitch,
  onRightArrow,
  primarySwitchAvailable,
}: ControlActionButtonsProps) {
  return (
    <TourTarget targetKey="shortcut-actions" style={styles.controlShortcutRow}>
      <View style={styles.shortcutGroup}>
        {isWindowsHost ? (
          <>
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Escape key"
              onPress={withHaptic(onEscape)}
            >
              <Minimize2Icon size={22} color="#b8afa5" />
            </Pressable>
            <View style={styles.shortcutDivider} />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Close current browser tab"
              onPress={withHaptic(onCloseTab)}
            >
              <SquareXIcon size={22} color="#b8afa5" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              disabled={!primarySwitchAvailable}
              style={[
                styles.desktopSwitchButton,
                !primarySwitchAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel="Previous desktop"
              onPress={withHaptic(() => onPrimarySwitch("left"))}
            >
              <PanelRightOpenIcon size={22} color="#b8afa5" />
            </Pressable>
            <View style={styles.shortcutDivider} />
            <Pressable
              disabled={!primarySwitchAvailable}
              style={[
                styles.desktopSwitchButton,
                !primarySwitchAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel="Next desktop"
              onPress={withHaptic(() => onPrimarySwitch("right"))}
            >
              <PanelRightCloseIcon size={22} color="#b8afa5" />
            </Pressable>
          </>
        )}
      </View>

      <View style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}>
        <Pressable
          style={styles.desktopSwitchButton}
          accessibilityLabel="Previous browser page"
          onPress={withHaptic(onBrowserBack)}
        >
          <Undo2 size={22} color="#f0c17c" />
        </Pressable>
        <View style={[styles.shortcutDivider, styles.shortcutDividerPrimary]} />
        <Pressable
          style={styles.desktopSwitchButton}
          accessibilityLabel="Next browser page"
          onPress={withHaptic(onBrowserForward)}
        >
          <Redo2 size={22} color="#f0c17c" />
        </Pressable>
      </View>

      <View style={styles.shortcutGroup}>
        <Pressable
          style={styles.desktopSwitchButton}
          accessibilityLabel="Left arrow key"
          onPress={withHaptic(onLeftArrow)}
        >
          <ClockArrowLeftIcon size={22} color="#9e9890" />
        </Pressable>
        <View style={styles.shortcutDivider} />
        <Pressable
          style={styles.desktopSwitchButton}
          accessibilityLabel="Right arrow key"
          onPress={withHaptic(onRightArrow)}
        >
          <ClockArrowRightIcon size={22} color="#9e9890" />
        </Pressable>
      </View>
    </TourTarget>
  );
}

const styles = StyleSheet.create({
  controlShortcutRow: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  shortcutGroup: {
    alignItems: "center",
    backgroundColor: "#11100e",
    borderColor: "#231c16",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 48,
    overflow: "hidden",
  },
  shortcutGroupPrimary: {
    backgroundColor: "#17130f",
    borderColor: "#3a2a1e",
  },
  shortcutDivider: {
    backgroundColor: "#231c16",
    height: 22,
    width: 1,
  },
  shortcutDividerPrimary: {
    backgroundColor: "#3a2a1e",
  },
  desktopSwitchButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  disabledControl: {
    opacity: 0.45,
  },
});
