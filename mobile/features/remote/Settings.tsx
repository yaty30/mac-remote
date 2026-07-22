import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  Volume2 as VolumeOnIcon,
  VolumeX as VolumeMutedIcon,
} from "lucide-react-native";
import { HeaderGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import { FEATURES } from "../../navigation/featureFlags";
import type {
  ConnectionStatus,
  HostDisplayInfo,
} from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";
import { withHaptic } from "../../utils/haptics";
import { useHostMedia } from "../media/useHostMedia";
import {
  formatPercent,
  formatStep,
  MEDIA_CONTROL_STEPS,
} from "../media/mediaUtils";
import { RESTART_COUNTDOWN_SECONDS } from "../settings/constants";
import { SettingsBottomSheet } from "../settings/SettingsBottomSheet";

const BODY_HORIZONTAL_PADDING = 10;

export interface RemoteSettingsHandle {
  close: () => void;
  isOpen: () => boolean;
  open: () => void;
  toggle: () => void;
}

interface SettingsProps {
  disabled?: boolean;
  onToggleStart?: () => void;
  settingsRef: RefObject<RemoteSettingsHandle | null>;
}

interface RemoteSettingsPanelProps {
  controlsAvailability: {
    brightnessAvailable: boolean;
    volumeAvailable: boolean;
  };
  hostDisplay: HostDisplayInfo | null;
  hostName: string;
  onLogout?: () => void;
  onRestartTour: () => void;
  sensitivity: number;
  setSensitivity: (value: number) => void;
  setUnnaturalScrolling: (value: boolean) => void;
  socket: RemoteSocket;
  status: ConnectionStatus;
  unnaturalScrolling: boolean;
}

export function Settings({
  disabled = false,
  onToggleStart,
  settingsRef,
}: SettingsProps) {
  return (
    <TourTarget targetKey="settings-button">
      <HeaderGradientButton
        accessibilityLabel="Open settings"
        action={() => {
          onToggleStart?.();
          settingsRef.current?.toggle();
        }}
        buttonStyle={[styles.headerActionButton, styles.settingsButton]}
        disabled={disabled}
        disabledStyle={styles.headerActionButtonDisabled}
        gradientStyle={styles.headerActionGradient}
        icon={<Ionicons name="settings" size={20} color="#f0a942" />}
        pressedStyle={styles.headerActionButtonPressed}
      />
    </TourTarget>
  );
}

export const RemoteSettingsPanel = forwardRef<
  RemoteSettingsHandle,
  RemoteSettingsPanelProps
>(function RemoteSettingsPanel(
  {
    controlsAvailability,
    hostDisplay,
    hostName,
    onLogout,
    onRestartTour,
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    socket,
    status,
    unnaturalScrolling,
  },
  ref,
) {
  const restartTourAfterCloseRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const monitorName = hostDisplay?.name ?? "Unknown monitor";
  const monitorMeta = hostDisplay
    ? hostDisplay.isTv
      ? "TV detected"
      : "Display detected"
    : "Connect to host for display details";
  const {
    adjustVolumeStep,
    applyHostState,
    brightness,
    brightnessAdjustable,
    handleBrightnessSlideComplete,
    handleBrightnessSlideStart,
    handleBrightnessValueChange,
    resetHostMedia,
    toggleMute,
    volume,
    volumeAdjustable,
    volumeButtonColor,
    volumeMuted,
    volumeStep,
  } = useHostMedia(socket, controlsAvailability);

  useImperativeHandle(
    ref,
    () => ({
      close: () => setIsOpen(false),
      isOpen: () => isOpen,
      open: () => setIsOpen(true),
      toggle: () => setIsOpen((visible) => !visible),
    }),
    [isOpen],
  );

  useEffect(() => {
    if (isOpen && status === "connected") {
      socket.requestHostState();
    }
  }, [isOpen, socket, status]);

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        applyHostState(message);
      }
    });

    return unsubscribe;
  }, [socket]);

  useEffect(() => {
    if (status !== "connected") {
      resetHostMedia();
    }
  }, [status]);

  useEffect(() => {
    if (restartCountdown === null) {
      return;
    }

    if (restartCountdown <= 0) {
      setRestartCountdown(null);
      return;
    }

    const timeout = setTimeout(() => {
      setRestartCountdown((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }, 1000);

    return () => clearTimeout(timeout);
  }, [restartCountdown]);

  function sendRestartHost() {
    setRestartCountdown(RESTART_COUNTDOWN_SECONDS);
    socket.sendRestartHost();
  }

  function confirmRestartHost() {
    if (status !== "connected" || restartCountdown !== null) {
      return;
    }

    Alert.alert(
      "Restart host?",
      `This will force restart ${hostName || "the connected computer"} now. Unsaved documents and terminal sessions may be closed without another prompt.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Restart",
          style: "destructive",
          onPress: sendRestartHost,
        },
      ],
    );
  }

  function confirmLogout() {
    if (!onLogout) {
      return;
    }

    Alert.alert(
      "Log out?",
      "This will clear your saved session on this device and return you to the login screen.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => {
            setIsOpen(false);
            onLogout();
          },
        },
      ],
    );
  }

  function restartAppTour() {
    restartTourAfterCloseRef.current = true;
    setIsOpen(false);
  }

  function handleSettingsAfterClose() {
    if (!restartTourAfterCloseRef.current) {
      return;
    }

    restartTourAfterCloseRef.current = false;
    onRestartTour();
  }

  return (
    <SettingsBottomSheet
      isOpen={isOpen}
      onAfterClose={handleSettingsAfterClose}
      onOpenChange={setIsOpen}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.settingsScroll}
        contentContainerStyle={styles.settingsContent}
      >
        <View style={styles.sensitivityCard}>
          <View style={styles.settingsCardHeader}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="tv-outline" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Current Monitor</Text>
            </View>
          </View>
          <View style={styles.monitorRow}>
            <View
              style={[
                styles.monitorIcon,
                hostDisplay?.isTv ? styles.monitorIconTv : null,
              ]}
            >
              <Ionicons
                name={hostDisplay?.isTv ? "tv-outline" : "desktop-outline"}
                size={22}
                color="#ffffff"
              />
            </View>
            <View style={styles.hostTextBlock}>
              <Text style={styles.hostValue}>{monitorName}</Text>
              <Text style={styles.hostMeta}>{monitorMeta}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.settingsCardHeader}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="speedometer-outline" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Sensitivity</Text>
            </View>
          </View>
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={0.25}
              maximumValue={3}
              step={0.05}
              value={sensitivity}
              minimumTrackTintColor="#ff941f"
              maximumTrackTintColor="#33261b"
              thumbTintColor="#ffffff"
              onValueChange={setSensitivity}
            />
            <Text style={styles.sensitivityValue}>
              {sensitivity.toFixed(2)}x
            </Text>
          </View>
        </View>

        <View style={[styles.sensitivityCard, styles.settingToggleCard]}>
          <View style={styles.settingToggleRow}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="swap-vertical" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Unnatural scrolling</Text>
            </View>
            <View style={styles.settingSwitchWrap}>
              <Switch
                ios_backgroundColor="#33261b"
                onValueChange={setUnnaturalScrolling}
                thumbColor={unnaturalScrolling ? "#ffffff" : "#a7a39d"}
                trackColor={{ false: "#33261b", true: "#ff941f" }}
                value={unnaturalScrolling}
              />
            </View>
          </View>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.settingHeaderRow}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="sunny-outline" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Brightness</Text>
            </View>
            {hostDisplay?.brightnessAdjustable === false ? (
              <Text style={styles.settingUnavailable}>Unavailable on TV</Text>
            ) : null}
          </View>
          <View style={styles.brightnessSliderWrap}>
            <View style={styles.mediaValueRow}>
              <Text
                style={[
                  styles.mediaValueText,
                  !brightnessAdjustable ? styles.disabledText : null,
                ]}
              >
                {formatPercent(brightness)}
              </Text>
            </View>
            <View style={styles.brightnessSliderRow}>
              <Ionicons
                name="sunny-outline"
                size={17}
                color={brightnessAdjustable ? "#a7a39d" : "#5c554e"}
              />
              {isOpen && brightness !== null ? (
                <Slider
                  disabled={!brightnessAdjustable}
                  maximumTrackTintColor="#33261b"
                  maximumValue={100}
                  minimumTrackTintColor={
                    brightnessAdjustable ? "#ffb347" : "#3a2a1e"
                  }
                  minimumValue={0}
                  onSlidingComplete={handleBrightnessSlideComplete}
                  onSlidingStart={handleBrightnessSlideStart}
                  onValueChange={handleBrightnessValueChange}
                  step={1}
                  style={styles.slider}
                  thumbTintColor={brightnessAdjustable ? "#ffffff" : "#66594c"}
                  value={brightness}
                />
              ) : (
                <View style={styles.slider} />
              )}
              <Ionicons
                name="sunny"
                size={18}
                color={brightnessAdjustable ? "#ffb347" : "#5c554e"}
              />
            </View>
          </View>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.settingHeaderRow}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="volume-high-outline" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Volume</Text>
            </View>
            <View style={styles.settingHeaderActions}>
              {hostDisplay?.volumeAdjustable === false ? (
                <Text style={styles.settingUnavailable}>Unavailable on TV</Text>
              ) : null}
              <Pressable
                accessibilityLabel={volumeMuted ? "Unmute volume" : "Mute volume"}
                accessibilityRole="button"
                disabled={!volumeAdjustable}
                hitSlop={8}
                onPress={withHaptic(toggleMute)}
                style={[
                  styles.volumeMuteButton,
                  !volumeAdjustable ? styles.disabledControl : null,
                ]}
              >
                {volumeMuted ? (
                  <VolumeMutedIcon color={volumeButtonColor} />
                ) : (
                  <VolumeOnIcon color={volumeButtonColor} />
                )}
              </Pressable>
            </View>
          </View>
          <View style={styles.mediaControlRow}>
            <Pressable
              disabled={
                !volumeAdjustable || volumeStep === null || volumeStep === 0
              }
              style={[
                styles.mediaStepButton,
                !volumeAdjustable || volumeStep === null || volumeStep === 0
                  ? styles.disabledControl
                  : null,
              ]}
              onPress={withHaptic(() => adjustVolumeStep(-1))}
            >
              <Ionicons name="remove" size={22} color="#ffffff" />
            </Pressable>
            <View style={styles.mediaLevelWrap}>
              <View style={styles.mediaValueRow}>
                <Text
                  style={[
                    styles.mediaValueText,
                    !volumeAdjustable ? styles.disabledText : null,
                  ]}
                >
                  {formatPercent(volume)}
                </Text>
                <Text
                  style={[
                    styles.mediaStepText,
                    !volumeAdjustable ? styles.disabledText : null,
                  ]}
                >
                  {formatStep(volumeStep)}
                </Text>
              </View>
              <View style={styles.mediaTickRow}>
                {Array.from({ length: MEDIA_CONTROL_STEPS }).map((_, index) => (
                  <View
                    key={`volume-${index}`}
                    style={[
                      styles.mediaTick,
                      volumeStep !== null && index < volumeStep
                        ? styles.volumeTickActive
                        : null,
                      !volumeAdjustable ? styles.disabledControl : null,
                    ]}
                  />
                ))}
              </View>
            </View>
            <Pressable
              disabled={
                !volumeAdjustable ||
                volumeStep === null ||
                volumeStep === MEDIA_CONTROL_STEPS
              }
              style={[
                styles.mediaStepButton,
                !volumeAdjustable ||
                volumeStep === null ||
                volumeStep === MEDIA_CONTROL_STEPS
                  ? styles.disabledControl
                  : null,
              ]}
              onPress={withHaptic(() => adjustVolumeStep(1))}
            >
              <Ionicons name="add" size={22} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.settingsCardHeader}>
            <View style={styles.settingsCardTitleRow}>
              <View style={[styles.settingsCardIcon, styles.dangerIcon]}>
                <Ionicons name="power" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>Host Power</Text>
            </View>
          </View>
          <Pressable
            disabled={status !== "connected" || restartCountdown !== null}
            style={[
              styles.restartHostButton,
              status !== "connected" || restartCountdown !== null
                ? styles.disabledControl
                : null,
            ]}
            onPress={withHaptic(confirmRestartHost)}
          >
            <Ionicons name="reload-circle-outline" size={22} color="#ffffff" />
            <Text style={styles.restartHostText}>
              {restartCountdown === null
                ? "Force Restart Host"
                : `Restarting in ${restartCountdown}s`}
            </Text>
          </Pressable>
          {restartCountdown !== null ? (
            <Text style={styles.restartHostMeta}>
              Waiting for macOS restart window to finish.
            </Text>
          ) : null}
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.settingsCardHeader}>
            <View style={styles.settingsCardTitleRow}>
              <View style={styles.settingsCardIcon}>
                <Ionicons name="sparkles-outline" size={18} color="#ffffff" />
              </View>
              <Text style={styles.sensitivityLabel}>App Tour</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Restart app tour"
            accessibilityRole="button"
            onPress={withHaptic(restartAppTour)}
            style={({ pressed }) => [
              styles.restartTourButton,
              pressed ? styles.restartTourButtonPressed : null,
            ]}
          >
            <Ionicons name="refresh" size={19} color="#f0a942" />
            <Text style={styles.restartTourText}>Restart App Tour</Text>
          </Pressable>
        </View>

        {FEATURES.accountAuthentication ? (
          <View style={styles.sensitivityCard}>
            <View style={styles.settingsCardHeader}>
              <View style={styles.settingsCardTitleRow}>
                <View style={[styles.settingsCardIcon, styles.dangerIcon]}>
                  <Ionicons name="log-out-outline" size={18} color="#ffffff" />
                </View>
                <Text style={styles.sensitivityLabel}>Account</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Log out"
              accessibilityRole="button"
              disabled={!onLogout}
              onPress={withHaptic(confirmLogout)}
              style={({ pressed }) => [
                styles.logoutButton,
                pressed ? styles.logoutButtonPressed : null,
                !onLogout ? styles.disabledControl : null,
              ]}
            >
              <Ionicons name="log-out-outline" size={19} color="#ffffff" />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SettingsBottomSheet>
  );
});

const styles = StyleSheet.create({
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
  headerActionButtonDisabled: {
    opacity: 0.45,
  },
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  headerActionGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  settingsButton: {
    borderColor: "rgba(240, 169, 66, 0.42)",
  },
  settingsScroll: {
    flex: 1,
  },
  settingsContent: {
    gap: 12,
    paddingBottom: 28,
  },
  sensitivityCard: {
    alignItems: "stretch",
    backgroundColor: "#12110f",
    borderColor: "#2c2117",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: BODY_HORIZONTAL_PADDING,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsCardTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 10,
  },
  settingsCardIcon: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  dangerIcon: {
    backgroundColor: "#3a1717",
    borderColor: "#713131",
  },
  sensitivityLabel: {
    color: "#cec8be",
    fontSize: 14,
    fontWeight: "800",
  },
  settingHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingToggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  settingToggleCard: {
    justifyContent: "center",
  },
  settingSwitchWrap: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
  },
  settingHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  settingUnavailable: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "800",
  },
  sliderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  brightnessSliderWrap: {
    gap: 8,
  },
  brightnessSliderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  mediaControlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  mediaStepButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  volumeMuteButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#3a2a1e",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  mediaLevelWrap: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  mediaValueRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mediaValueText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  mediaStepText: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "900",
  },
  mediaTickRow: {
    flexDirection: "row",
    gap: 3,
    height: 18,
  },
  mediaTick: {
    backgroundColor: "#33261b",
    borderRadius: 3,
    flex: 1,
  },
  volumeTickActive: {
    backgroundColor: "#ff941f",
  },
  hostTextBlock: {
    flex: 1,
    gap: 4,
  },
  hostValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  hostMeta: {
    color: "#9d968e",
    fontSize: 12,
    fontWeight: "700",
  },
  monitorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 48,
  },
  monitorIcon: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderColor: "#33261b",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monitorIconTv: {
    backgroundColor: "#27301f",
    borderColor: "#50643a",
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sensitivityValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    minWidth: 48,
    textAlign: "center",
  },
  disabledControl: {
    opacity: 0.45,
  },
  disabledText: {
    color: "#756f68",
  },
  restartHostButton: {
    alignItems: "center",
    backgroundColor: "#8e2525",
    borderColor: "#c74343",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 12,
  },
  restartHostText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  restartHostMeta: {
    color: "#a7a39d",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  restartTourButton: {
    alignItems: "center",
    backgroundColor: "#211811",
    borderColor: "rgba(240, 169, 66, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  restartTourButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  restartTourText: {
    color: "#f7f5f1",
    fontSize: 14,
    fontWeight: "900",
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: "#4b211c",
    borderColor: "#8e3a31",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  logoutButtonPressed: {
    backgroundColor: "#5f2822",
    transform: [{ scale: 0.99 }],
  },
  logoutText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
