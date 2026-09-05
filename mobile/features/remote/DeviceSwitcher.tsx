import { Ionicons } from "@expo/vector-icons";
import { Pencil } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { TourTarget } from "../../components/tour/TourTarget";
import { withHaptic } from "../../utils/haptics";
import AppleIcon from "../../assets/icons/apple.svg";
import WindowsIcon from "../../assets/icons/windows.svg";
import type { HostPlatform } from "../../types/protocol";
import type { SavedDevice } from "../connection/types";

const BODY_HORIZONTAL_PADDING = 10;
const DEVICE_DROPDOWN_MAX_HEIGHT = 286;
const DEVICE_NAME_MIN_LENGTH = 2;
const DEVICE_NAME_MAX_LENGTH = 20;

interface DeviceSwitcherProps {
  dropdownOpen: boolean;
  onDeleteDevice: (device: SavedDevice) => void;
  onDropdownOpenChange: (open: boolean) => void;
  onRenameDevice: (device: SavedDevice, name: string) => void;
  onSwitchDevice: (device: SavedDevice) => void;
  savedDevices: SavedDevice[];
  visibleDeviceHost: string;
  visibleDeviceName: string;
  visibleHostPlatform: HostPlatform | null;
}

export function DeviceSwitcher({
  dropdownOpen,
  onDeleteDevice,
  onDropdownOpenChange,
  onRenameDevice,
  onSwitchDevice,
  savedDevices,
  visibleDeviceHost,
  visibleDeviceName,
  visibleHostPlatform,
}: DeviceSwitcherProps) {
  const { width: windowWidth } = useWindowDimensions();
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const [dropdownMounted, setDropdownMounted] = useState(false);
  const [renamingDevice, setRenamingDevice] = useState<SavedDevice | null>(
    null,
  );
  const [renameDeviceName, setRenameDeviceName] = useState("");
  const [renameDeviceError, setRenameDeviceError] = useState("");
  const selectedDevicePlatform = getSelectedDevicePlatform(
    savedDevices,
    visibleDeviceHost,
    visibleHostPlatform,
  );
  const devicePickerTitle = visibleDeviceName || "No device saved";
  const dropdownAnimatedStyle = {
    marginLeft: 0,
    maxHeight: dropdownAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, DEVICE_DROPDOWN_MAX_HEIGHT],
    }),
    opacity: dropdownAnim,
    transform: [
      {
        translateY: dropdownAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
    width: Math.max(0, windowWidth - BODY_HORIZONTAL_PADDING * 2),
  };
  const chevronAnimatedStyle = {
    transform: [
      {
        rotate: dropdownAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "180deg"],
        }),
      },
    ],
  };

  useEffect(() => {
    if (dropdownOpen) {
      setDropdownMounted(true);
      Animated.timing(dropdownAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      return;
    }

    Animated.timing(dropdownAnim, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setDropdownMounted(false);
      }
    });
  }, [dropdownAnim, dropdownOpen]);

  function openRenameDevice(device: SavedDevice) {
    setRenamingDevice(device);
    setRenameDeviceName(device.name);
    setRenameDeviceError("");
  }

  function closeRenameDevice() {
    setRenamingDevice(null);
    setRenameDeviceName("");
    setRenameDeviceError("");
  }

  function saveRenamedDevice() {
    if (!renamingDevice) {
      return;
    }

    const cleanName = renameDeviceName.trim();
    const duplicate = savedDevices.some(
      (device) =>
        device.id !== renamingDevice.id &&
        device.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    if (cleanName.length < DEVICE_NAME_MIN_LENGTH) {
      setRenameDeviceError("Use at least 2 letters.");
      return;
    }

    if (cleanName.length > DEVICE_NAME_MAX_LENGTH) {
      setRenameDeviceError("Use 20 letters or fewer.");
      return;
    }

    if (duplicate) {
      setRenameDeviceError("That device name is already used.");
      return;
    }

    onRenameDevice(renamingDevice, cleanName);
    closeRenameDevice();
  }

  return (
    <>
      <TourTarget targetKey="device-switch" style={styles.homeDevicePicker}>
        <Pressable
          accessibilityLabel="Select host"
          style={({ pressed }) => [
            styles.homeDeviceButton,
            pressed ? styles.homeDeviceButtonPressed : null,
          ]}
          onPress={withHaptic(() => onDropdownOpenChange(!dropdownOpen))}
        >
          <View style={styles.homeDeviceIcon}>
            <DevicePlatformIcon platform={selectedDevicePlatform} size={16} />
          </View>
          <Text
            style={styles.homeDeviceName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {devicePickerTitle}
          </Text>
          <Animated.View style={chevronAnimatedStyle}>
            <Ionicons name="chevron-down" size={19} color="#b7b2ab" />
          </Animated.View>
        </Pressable>
        {dropdownMounted ? (
          <Animated.View
            style={[styles.homeDeviceDropdown, dropdownAnimatedStyle]}
          >
            {savedDevices.length > 0 ? (
              <ScrollView
                style={styles.homeDeviceDropdownList}
                showsVerticalScrollIndicator={false}
              >
                {savedDevices.map((device) => {
                  const selected = device.host === visibleDeviceHost;

                  return (
                    <View
                      key={device.id}
                      style={[
                        styles.homeDeviceOption,
                        selected ? styles.homeDeviceOptionSelected : null,
                      ]}
                    >
                      <Pressable
                        style={styles.homeDeviceOptionSelect}
                        onPress={withHaptic(() => onSwitchDevice(device))}
                      >
                        <View style={styles.homeDeviceOptionIcon}>
                          <DevicePlatformIcon
                            platform={getDevicePlatform(
                              device,
                              visibleDeviceHost,
                              visibleHostPlatform,
                            )}
                            size={18}
                          />
                        </View>
                        <Text
                          style={styles.homeDeviceOptionName}
                          numberOfLines={1}
                        >
                          {device.name}
                        </Text>
                      </Pressable>
                      <View style={styles.homeDeviceOptionActions}>
                        {selected ? (
                          <View style={styles.homeDeviceSelectedMark}>
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#74f0a7"
                            />
                          </View>
                        ) : null}
                        <Pressable
                          accessibilityLabel={`Rename ${device.name}`}
                          style={styles.deviceEditButton}
                          onPress={withHaptic(() => openRenameDevice(device))}
                        >
                          <Pencil size={17} color="#ffffff" />
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Delete ${device.name}`}
                          style={styles.deviceDeleteButton}
                          onPress={withHaptic(() => onDeleteDevice(device))}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color="#ff8a8a"
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.emptyDeviceText}>
                Scan a desktop QR code to save it here.
              </Text>
            )}
          </Animated.View>
        ) : null}
      </TourTarget>

      <Modal
        animationType="fade"
        onRequestClose={closeRenameDevice}
        transparent
        visible={renamingDevice !== null}
      >
        <View style={styles.renameBackdrop}>
          <View style={styles.renameSheet}>
            <View style={styles.renameHeader}>
              <View style={styles.renameIcon}>
                <Pencil size={18} color="#1b1008" />
              </View>
              <Text style={styles.renameTitle}>Rename Device</Text>
            </View>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={DEVICE_NAME_MAX_LENGTH}
              onChangeText={(value) => {
                setRenameDeviceName(value);
                setRenameDeviceError("");
              }}
              placeholder="Device name"
              placeholderTextColor="#756f68"
              selectTextOnFocus
              style={styles.renameInput}
              value={renameDeviceName}
            />
            {renameDeviceError ? (
              <Text style={styles.renameError}>{renameDeviceError}</Text>
            ) : null}
            <View style={styles.renameActions}>
              <Pressable
                style={[styles.renameButton, styles.renameCancelButton]}
                onPress={withHaptic(closeRenameDevice)}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.renameButton, styles.renameSaveButton]}
                onPress={withHaptic(saveRenamedDevice)}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function getDevicePlatform(
  device: SavedDevice,
  activeHost: string,
  activePlatform: HostPlatform | null,
): HostPlatform | undefined {
  if (device.host === activeHost && activePlatform) {
    return activePlatform;
  }

  return device.platform;
}

function getSelectedDevicePlatform(
  savedDevices: SavedDevice[],
  activeHost: string,
  activePlatform: HostPlatform | null,
): HostPlatform | undefined {
  const selectedDevice = savedDevices.find(
    (device) => device.host === activeHost,
  );

  return activePlatform ?? selectedDevice?.platform;
}

function DevicePlatformIcon({
  platform,
  size,
}: {
  platform?: HostPlatform;
  size: number;
}) {
  if (platform === "win32") {
    return <WindowsIcon height={size} width={size} />;
  }

  if (platform === "darwin") {
    return <AppleIcon height={size} width={size} />;
  }

  return <Ionicons name="desktop-outline" size={size} color="#ffffff" />;
}

const styles = StyleSheet.create({
  homeDevicePicker: {
    alignSelf: "stretch",
    gap: 6,
    minWidth: 0,
    position: "relative",
    zIndex: 20,
  },
  homeDeviceButton: {
    alignItems: "center",
    backgroundColor: "rgba(18, 17, 15, 0.86)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  homeDeviceButtonPressed: {
    opacity: 0.82,
  },
  homeDeviceIcon: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  homeDeviceName: {
    color: "#f7f5f1",
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    minWidth: 0,
  },
  homeDeviceDropdown: {
    backgroundColor: "rgba(18, 17, 15, 0.98)",
    borderColor: "rgba(240, 169, 66, 0.2)",
    borderRadius: 14,
    borderWidth: 1,
    elevation: 18,
    left: 0,
    position: "absolute",
    shadowColor: "#4d250496",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.72,
    shadowRadius: 34,
    top: 60,
    zIndex: 30,
  },
  homeDeviceDropdownList: {
    backgroundColor: "rgba(18, 17, 15, 0.98)",
    borderRadius: 14,
    elevation: 12,
    maxHeight: 220,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.48,
    shadowRadius: 24,
    width: "100%",
  },
  homeDeviceOption: {
    alignItems: "center",
    alignSelf: "stretch",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
  },
  homeDeviceOptionSelected: {
    backgroundColor: "rgba(240, 169, 66, 0.09)",
  },
  homeDeviceOptionSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    minWidth: 0,
  },
  homeDeviceOptionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  homeDeviceOptionName: {
    color: "#f7f5f1",
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  homeDeviceOptionActions: {
    flexDirection: "row",
    gap: 6,
  },
  homeDeviceSelectedMark: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 22,
  },
  deviceDeleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(73, 24, 26, 0.84)",
    borderColor: "rgba(255, 87, 87, 0.3)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deviceEditButton: {
    alignItems: "center",
    backgroundColor: "rgba(42, 32, 20, 0.9)",
    borderColor: "rgba(240, 169, 66, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyDeviceText: {
    color: "#9d968e",
    fontSize: 13,
    fontWeight: "700",
    padding: 12,
  },
  renameBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  renameSheet: {
    backgroundColor: "#12110f",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%",
  },
  renameHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  renameIcon: {
    alignItems: "center",
    backgroundColor: "#ff941f",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  renameTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  renameInput: {
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  renameError: {
    color: "#ff8a8a",
    fontSize: 12,
    fontWeight: "800",
  },
  renameActions: {
    flexDirection: "row",
    gap: 10,
  },
  renameButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  renameCancelButton: {
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderWidth: 1,
  },
  renameSaveButton: {
    backgroundColor: "#ff941f",
  },
  renameCancelText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  renameSaveText: {
    color: "#1b1008",
    fontSize: 14,
    fontWeight: "900",
  },
});
