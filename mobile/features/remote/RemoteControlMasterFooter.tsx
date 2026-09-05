import {
  Icon,
  LayoutPanelTop as LayoutPanelTopIcon,
  Minimize2 as Minimize2Icon,
  MouseRight as MouseRightIcon,
  RefreshCw as RefreshCwIcon,
  SquareX as SquareXIcon,
} from "lucide-react-native";
import type { ComponentType, RefObject } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScanGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import { withHaptic } from "../../utils/haptics";
import { KeyboardControlButton, type RemoteKeyboardHandle } from "./Keyboard";
import { tabX } from '@lucide/lab';

const BODY_HORIZONTAL_PADDING = 10;

interface RemoteControlMasterFooterProps {
  isWindowsHost: boolean;
  keyboardRef: RefObject<RemoteKeyboardHandle | null>;
  onCloseTab: () => void;
  onEscape: () => void;
  onReload: () => void;
  onRightClick: () => void;
  onShowOverview: () => void;
  onTogglePlayback: () => void;
  overviewAvailable: boolean;
  overviewLabel: string;
  playbackIcon: ComponentType<{ color?: string; size?: number }>;
  playbackPaused: boolean;
}

export function RemoteControlMasterFooter({
  isWindowsHost,
  keyboardRef,
  onCloseTab,
  onEscape,
  onReload,
  onRightClick,
  onShowOverview,
  onTogglePlayback,
  overviewAvailable,
  overviewLabel,
  playbackIcon: PlaybackIcon,
  playbackPaused,
}: RemoteControlMasterFooterProps) {
  return (
    <>
      {!isWindowsHost ? (
        <TourTarget targetKey="mac-actions" style={styles.remoteActionRow}>
          <View style={[styles.shortcutGroup, styles.shortcutGroupPrimary]}>
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Escape key"
              onPress={withHaptic(onEscape)}
            >
              <Minimize2Icon size={22} color="#f0c17c" />
            </Pressable>
            <View style={[styles.shortcutDivider, styles.shortcutDividerPrimary]} />
            <Pressable
              disabled={!overviewAvailable}
              style={[
                styles.desktopSwitchButton,
                !overviewAvailable ? styles.disabledControl : null,
              ]}
              accessibilityLabel={overviewLabel}
              onPress={withHaptic(onShowOverview)}
            >
              <LayoutPanelTopIcon size={22} color="#f0c17c" />
            </Pressable>
            <View style={[styles.shortcutDivider, styles.shortcutDividerPrimary]} />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel={playbackPaused ? "Play media" : "Pause media"}
              onPress={withHaptic(onTogglePlayback)}
            >
              <PlaybackIcon size={22} color="#f0c17c" />
            </Pressable>
            <View style={[styles.shortcutDivider, styles.shortcutDividerPrimary]} />
            <Pressable
              style={styles.desktopSwitchButton}
              accessibilityLabel="Close current browser tab"
              onPress={withHaptic(onCloseTab)}
            >
              <Icon iconNode={tabX} size={22} color="#f0c17c" />
            </Pressable>
          </View>
        </TourTarget>
      ) : null}

      <TourTarget targetKey="mouse-actions" style={styles.mouseButtonRow}>
        <ScanGradientButton
          accessibilityLabel="Refresh"
          action={onReload}
          buttonStyle={[styles.mouseButton, styles.mouseButtonSide]}
          colors={["#2b211a", "#1b1714", "#11100e"]}
          gradientStyle={styles.sideMouseButtonGradient}
          icon={<RefreshCwIcon size={23} color="#ffffff" />}
          pressedStyle={styles.mouseButtonPressed}
        />
        <KeyboardControlButton keyboardRef={keyboardRef} />
        <ScanGradientButton
          accessibilityLabel="Right Click"
          action={onRightClick}
          buttonStyle={[styles.mouseButton, styles.mouseButtonSide]}
          colors={["#2b211a", "#1b1714", "#11100e"]}
          gradientStyle={styles.sideMouseButtonGradient}
          icon={<MouseRightIcon size={23} color="#ffffff" />}
          pressedStyle={styles.mouseButtonPressed}
        />
      </TourTarget>
    </>
  );
}

const styles = StyleSheet.create({
  remoteActionRow: {
    flexDirection: "row",
    flexShrink: 0,
    height: 48,
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
  mouseButtonRow: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
    height: 48,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  mouseButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    overflow: "hidden",
    paddingHorizontal: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },
  mouseButtonSide: {
    flex: 3,
    paddingHorizontal: 0,
  },
  sideMouseButtonGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  mouseButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabledControl: {
    opacity: 0.45,
  },
});
