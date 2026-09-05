import { StyleSheet, View } from "react-native";
import type { RefObject } from "react";
import type { HostPlatform } from "../../types/protocol";
import type { SavedDevice } from "../connection/types";
import { DeviceSwitcher } from "./DeviceSwitcher";
import { QRScanner, type QRScannerHandle } from "./QRScanner";
import { Settings, type RemoteSettingsHandle } from "./Settings";
import { ToggleScreen } from "./ToggleScreen";

interface RemoteControlMasterHeaderProps {
  deviceDropdownOpen: boolean;
  onConnectToHost: (
    url: string,
    hostName?: string,
    pairingToken?: string,
  ) => void;
  onDeleteDevice: (device: SavedDevice) => void;
  onDeviceDropdownOpenChange: (open: boolean) => void;
  onRenameDevice: (device: SavedDevice, name: string) => void;
  onScannerOpenStart?: () => void;
  onScannerVisibilityChange?: (visible: boolean) => void;
  onScanError: () => void;
  onSettingsToggleStart?: () => void;
  onSleep?: () => void;
  onSwitchDevice: (device: SavedDevice) => void;
  qrScannerRef: RefObject<QRScannerHandle | null>;
  savedDevices: SavedDevice[];
  settingsDisabled?: boolean;
  settingsRef: RefObject<RemoteSettingsHandle | null>;
  visibleDeviceHost: string;
  visibleDeviceName: string;
  visibleHostPlatform: HostPlatform | null;
}

export function RemoteControlMasterHeader({
  deviceDropdownOpen,
  onConnectToHost,
  onDeleteDevice,
  onDeviceDropdownOpenChange,
  onRenameDevice,
  onScannerOpenStart,
  onScannerVisibilityChange,
  onScanError,
  onSettingsToggleStart,
  onSleep,
  onSwitchDevice,
  qrScannerRef,
  savedDevices,
  settingsDisabled = false,
  settingsRef,
  visibleDeviceHost,
  visibleDeviceName,
  visibleHostPlatform,
}: RemoteControlMasterHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <DeviceSwitcher
            dropdownOpen={deviceDropdownOpen}
            onDeleteDevice={onDeleteDevice}
            onDropdownOpenChange={onDeviceDropdownOpenChange}
            onRenameDevice={onRenameDevice}
            onSwitchDevice={onSwitchDevice}
            savedDevices={savedDevices}
            visibleDeviceHost={visibleDeviceHost}
            visibleDeviceName={visibleDeviceName}
            visibleHostPlatform={visibleHostPlatform}
          />
        </View>

        <View style={styles.actionRow}>
          <QRScanner
            ref={qrScannerRef}
            onConnectToHost={onConnectToHost}
            onOpenStart={onScannerOpenStart}
            onScanError={onScanError}
            onVisibilityChange={onScannerVisibilityChange}
          />
          <Settings
            disabled={settingsDisabled}
            onToggleStart={onSettingsToggleStart}
            settingsRef={settingsRef}
          />
          <ToggleScreen onSleep={onSleep} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    elevation: 50,
    gap: 14,
    paddingHorizontal: 10,
    paddingTop: 8,
    zIndex: 50,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
});
