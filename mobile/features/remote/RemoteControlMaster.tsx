import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Pause as PauseIcon, Play as PlayIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppSplashOverlay } from "../../components/AppSplashOverlay";
import { TourTarget } from "../../components/tour/TourTarget";
import { Trackpad } from "../trackpad/Trackpad";
import type { HostPlatform } from "../../types/protocol";
import { RemoteSocket } from "../../websocket/RemoteSocket";
import { sanitizeHostName } from "../connection/deviceUtils";
import { useRemoteConnection } from "../connection/useRemoteConnection";
import { useRemoteSettings } from "../settings/useRemoteSettings";
import { useCustomShortcuts } from "../shortcuts/useCustomShortcuts";
import type { CustomShortcut } from "../shortcuts/types";
import { ShortcutEditorModal } from "../shortcuts/ShortcutEditorModal";
import { useHostProfile } from "./useHostProfile";
import { useRemoteActions } from "./useRemoteActions";
import { useRemoteControlsAvailability } from "./useRemoteControlsAvailability";
import { RemoteControlMasterHeader } from "./RemoteControlMasterHeader";
import { RemoteKeyboard, type RemoteKeyboardHandle } from "./Keyboard";
import { Shortcuts } from "./Shortcuts";
import { ControlActionButtons } from "./ControlActionButtons";
import { RemoteControlMasterFooter } from "./RemoteControlMasterFooter";
import type { QRScannerHandle } from "./QRScanner";
import {
  RemoteSettingsPanel,
  type RemoteSettingsHandle,
} from "./Settings";
import { ConnectionPrompt } from "./ConnectionPrompt";
import { DeviceSwitchOverlay } from "./DeviceSwitchOverlay";
import { useConnectionOverlay } from "./hooks/useConnectionOverlay";
import { useDeviceSwitchFlow } from "./hooks/useDeviceSwitchFlow";
import { usePlaybackControls } from "./hooks/usePlaybackControls";
import { useRemoteTourSetup } from "./hooks/useRemoteTourSetup";

const BODY_HORIZONTAL_PADDING = 10;

interface RemoteControlMasterProps {
  onLogout?: () => void;
  showInitialSplash?: boolean;
}

export function RemoteControlMaster({
  onLogout,
  showInitialSplash = true,
}: RemoteControlMasterProps) {
  const socket = useMemo(() => new RemoteSocket(), []);
  const { height: windowHeight } = useWindowDimensions();
  const keyboardRef = useRef<RemoteKeyboardHandle | null>(null);
  const qrScannerRef = useRef<QRScannerHandle | null>(null);
  const settingsRef = useRef<RemoteSettingsHandle | null>(null);

  const [scannerVisible, setScannerVisible] = useState(false);
  const {
    applyHostProfile,
    hostCapabilities,
    hostDisplay,
    hostPlatform,
    resetHostProfile,
  } = useHostProfile();
  const controlsAvailability = useRemoteControlsAvailability({
    capabilities: hostCapabilities,
    display: hostDisplay,
    platform: hostPlatform,
  });
  const remoteActions = useRemoteActions(socket);
  const {
    authError,
    cancelConnection,
    cancelPendingConnection,
    connectionHydrated,
    connectToHost,
    deleteSavedDevice,
    deviceDropdownOpen,
    host,
    hostName,
    latencyMs,
    persistHostName,
    persistHostPlatform,
    renameSavedDevice,
    savedDevices,
    selectSavedDevice,
    setConnectionError,
    setDeviceDropdownOpen,
    status,
  } = useRemoteConnection(socket, {
    onResetHostState: () => {
      resetHostProfile();
    },
    onUnmount: () => {},
  });
  const {
    sensitivity,
    setSensitivity,
    setUnnaturalScrolling,
    unnaturalScrolling,
  } = useRemoteSettings(host);
  const [screenLayoutHeight, setScreenLayoutHeight] = useState(windowHeight);
  const [appSplashReleased, setAppSplashReleased] = useState(
    !showInitialSplash,
  );
  const {
    closeShortcutModal,
    customShortcuts,
    deleteCustomShortcut,
    editingShortcutId,
    openEditShortcutModal,
    openShortcutModal,
    pickShortcutIcon,
    saveCustomShortcut,
    setShortcutIconUri,
    setShortcutName,
    setShortcutWebsite,
    shortcutFormError,
    shortcutIconKey,
    shortcutIconUri,
    shortcutModalVisible,
    shortcutName,
    shortcutWebsite,
  } = useCustomShortcuts();
  const {
    playbackPaused,
    toggleRemotePlayback,
  } = usePlaybackControls(socket);
  const {
    cancelDeviceSwitch,
    deviceSwitchCancelAnimatedStyle,
    deviceSwitchCancelVisible,
    deviceSwitchOverlayAnimatedStyle,
    deviceSwitchOverlayMounted,
    deviceSwitchSpinnerAnimatedStyle,
    deviceSwitchUiSnapshot,
    switchingDeviceName,
    switchSavedDevice,
  } = useDeviceSwitchFlow({
    cancelConnection,
    cancelPendingConnection,
    getSelectedDevicePlatform,
    host,
    hostCapabilities,
    hostDisplay,
    hostName,
    hostPlatform,
    selectSavedDevice,
    setDeviceDropdownOpen,
    status,
  });
  const {
    connectionCancelAnimatedStyle,
    connectionCancelVisible,
    connectionInProgress,
    connectionSpinnerAnimatedStyle,
  } = useConnectionOverlay({
    deviceSwitchOverlayMounted,
    status,
  });
  const showConnectionPrompt =
    status !== "connected" && !deviceSwitchOverlayMounted;
  const appSplashReadyToDismiss =
    connectionHydrated &&
    (!host.trim() ||
      status === "idle" ||
      status === "disconnected" ||
      status === "error" ||
      (status === "connecting" && connectionCancelVisible) ||
      (status === "connected" && hostPlatform !== null));

  useEffect(() => {
    if (!showInitialSplash) {
      setAppSplashReleased(true);
      return;
    }

    if (appSplashReadyToDismiss) {
      setAppSplashReleased(true);
    }
  }, [appSplashReadyToDismiss, showInitialSplash]);

  useEffect(() => {
    const unsubscribe = socket.onMessage((message) => {
      if (message.type === "hostState") {
        applyHostProfile(message);
        persistHostPlatform(message.platform);

        const nextHostName = sanitizeHostName(message.hostName);

        const savedDevice = savedDevices.find((device) => device.host === host);

        if (nextHostName && !savedDevice) {
          persistHostName(nextHostName);
        }
      }
    });

    return unsubscribe;
  }, [
    applyHostProfile,
    host,
    persistHostName,
    persistHostPlatform,
    savedDevices,
    socket,
  ]);

  function sendCustomShortcut(shortcut: CustomShortcut) {
    remoteActions.openCustomShortcut(shortcut);
  }

  function sendSleep() {
    socket.sendSleep();
  }

  function handleLogout() {
    socket.disconnect();
    onLogout?.();
  }

  function getSelectedDevicePlatform(
    activeHost = host,
    activePlatform: HostPlatform | null = hostPlatform,
  ): HostPlatform | undefined {
    const selectedDevice = savedDevices.find(
      (device) => device.host === activeHost,
    );

    return activePlatform ?? selectedDevice?.platform;
  }

  function switchPrimaryHorizontal(direction: "left" | "right") {
    if (hostPlatform === "win32") {
      remoteActions.switchWindow(direction === "left" ? "previous" : "next");
      return;
    }

    remoteActions.switchWorkspace(direction);
  }

  function handleScreenLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    setScreenLayoutHeight((current) =>
      current === nextHeight ? current : nextHeight,
    );
  }

  const visibleHostPlatform = deviceSwitchUiSnapshot?.platform ?? hostPlatform;
  const visibleHostCapabilities =
    deviceSwitchUiSnapshot?.capabilities ?? hostCapabilities;
  const visibleHostDisplay = deviceSwitchUiSnapshot?.display ?? hostDisplay;
  const visibleStatus = deviceSwitchUiSnapshot ? "connected" : status;
  const visibleControlsAvailability = useRemoteControlsAvailability({
    capabilities: visibleHostCapabilities,
    display: visibleHostDisplay,
    platform: visibleHostPlatform,
  });
  const {
    overviewAvailable,
    overviewLabel,
    sleepAvailable,
    switchWindowAvailable,
    switchWorkspaceAvailable,
  } = visibleControlsAvailability;
  const isWindowsHost = visibleHostPlatform === "win32";
  const primarySwitchAvailable = isWindowsHost
    ? switchWindowAvailable
    : switchWorkspaceAvailable;
  const PlaybackIcon = playbackPaused ? PlayIcon : PauseIcon;
  const visibleDeviceHost = deviceSwitchUiSnapshot?.host ?? host;
  const visibleDeviceName = deviceSwitchUiSnapshot?.name ?? hostName;
  const { handleRestartTour } = useRemoteTourSetup({
    appSplashReleased,
    capabilities: visibleHostCapabilities,
    deviceSwitchOverlayMounted,
    hostPlatform: visibleHostPlatform,
    keyboardRef,
    scannerVisible,
    settingsRef,
    showConnectionPrompt,
  });

  return (
    <SafeAreaView style={styles.screen} onLayout={handleScreenLayout}>
      {deviceDropdownOpen ? (
        <Pressable
          accessibilityLabel="Close device list"
          style={styles.deviceDropdownDismissLayer}
          onPressIn={() => setDeviceDropdownOpen(false)}
        />
      ) : null}

      <DeviceSwitchOverlay
        cancelAnimatedStyle={deviceSwitchCancelAnimatedStyle}
        cancelVisible={deviceSwitchCancelVisible}
        name={switchingDeviceName}
        onCancel={cancelDeviceSwitch}
        overlayAnimatedStyle={deviceSwitchOverlayAnimatedStyle}
        spinnerAnimatedStyle={deviceSwitchSpinnerAnimatedStyle}
        visible={deviceSwitchOverlayMounted}
      />

      <RemoteControlMasterHeader
        deviceDropdownOpen={deviceDropdownOpen}
        onConnectToHost={connectToHost}
        onDeleteDevice={deleteSavedDevice}
        onDeviceDropdownOpenChange={setDeviceDropdownOpen}
        onRenameDevice={renameSavedDevice}
        onScannerOpenStart={() => {
          settingsRef.current?.close();
          setDeviceDropdownOpen(false);
        }}
        onScannerVisibilityChange={setScannerVisible}
        onScanError={setConnectionError}
        onSettingsToggleStart={() => setDeviceDropdownOpen(false)}
        onSleep={!showConnectionPrompt && sleepAvailable ? sendSleep : undefined}
        onSwitchDevice={switchSavedDevice}
        qrScannerRef={qrScannerRef}
        savedDevices={savedDevices}
        settingsDisabled={showConnectionPrompt}
        settingsRef={settingsRef}
        visibleDeviceHost={visibleDeviceHost}
        visibleDeviceName={visibleDeviceName}
        visibleHostPlatform={visibleHostPlatform}
      />

      <RemoteKeyboard
        ref={keyboardRef}
        hostPlatform={visibleHostPlatform}
        screenLayoutHeight={screenLayoutHeight}
        socket={socket}
      />

      <RemoteSettingsPanel
        ref={settingsRef}
        controlsAvailability={visibleControlsAvailability}
        hostDisplay={visibleHostDisplay}
        hostName={visibleDeviceName}
        onLogout={handleLogout}
        onRestartTour={handleRestartTour}
        sensitivity={sensitivity}
        setSensitivity={setSensitivity}
        setUnnaturalScrolling={setUnnaturalScrolling}
        socket={socket}
        status={status}
        unnaturalScrolling={unnaturalScrolling}
      />

      <View style={styles.remoteControls}>
        {showConnectionPrompt ? (
          <ConnectionPrompt
            authError={authError}
            cancelAnimatedStyle={connectionCancelAnimatedStyle}
            cancelVisible={connectionCancelVisible}
            host={host}
            hostName={hostName}
            inProgress={connectionInProgress}
            onCancel={cancelConnection}
            onScan={() => qrScannerRef.current?.open()}
            spinnerAnimatedStyle={connectionSpinnerAnimatedStyle}
            visible={showConnectionPrompt}
          />
        ) : (
          <>
            <Shortcuts
              onAddShortcut={openShortcutModal}
              onEditShortcut={openEditShortcutModal}
              onShortcutPress={sendCustomShortcut}
              shortcuts={customShortcuts}
            />

            <ControlActionButtons
              isWindowsHost={isWindowsHost}
              onBrowserBack={() => socket.sendTextCommand("browserBack")}
              onBrowserForward={() => socket.sendTextCommand("browserForward")}
              onCloseTab={() => socket.sendTextCommand("closeTab")}
              onEscape={() => socket.sendKey("escape")}
              onLeftArrow={() => socket.sendKey("leftArrow")}
              onPrimarySwitch={switchPrimaryHorizontal}
              onRightArrow={() => socket.sendKey("rightArrow")}
              primarySwitchAvailable={primarySwitchAvailable}
            />

            <View
              style={styles.trackpadWrap}
              onStartShouldSetResponder={() =>
                keyboardRef.current?.isVisible() ?? false
              }
              onResponderRelease={() => {
                keyboardRef.current?.close();
              }}
            >
              <TourTarget targetKey="trackpad" style={styles.trackpadTourTarget}>
                <Trackpad
                  latencyMs={latencyMs}
                  onMove={(dx, dy) =>
                    socket.sendMove(dx * sensitivity, dy * sensitivity)
                  }
                  onClick={() => socket.sendLeftClick()}
                  onDoubleClick={() => socket.sendDoubleClick()}
                  onRightClick={() => socket.sendRightClick()}
                  onScroll={(dx, dy) => {
                    const direction = unnaturalScrolling ? -1 : 1;
                    socket.sendScroll(dx * direction, dy * direction);
                  }}
                  onZoom={(direction) => socket.sendZoom(direction)}
                  onSwipeSpaces={(direction) => {
                    if (primarySwitchAvailable) {
                      switchPrimaryHorizontal(direction);
                    }
                  }}
                  status={visibleStatus}
                />
              </TourTarget>
            </View>

            <RemoteControlMasterFooter
              isWindowsHost={isWindowsHost}
              keyboardRef={keyboardRef}
              onCloseTab={() => socket.sendTextCommand("closeTab")}
              onEscape={() => socket.sendKey("escape")}
              onReload={() => socket.sendTextCommand("reload")}
              onRightClick={() => socket.sendRightClick()}
              onShowOverview={remoteActions.showOverview}
              onTogglePlayback={toggleRemotePlayback}
              overviewAvailable={overviewAvailable}
              overviewLabel={overviewLabel}
              playbackIcon={PlaybackIcon}
              playbackPaused={playbackPaused}
            />
          </>
        )}
      </View>

      <ShortcutEditorModal
        editingShortcutId={editingShortcutId}
        formError={shortcutFormError}
        iconKey={shortcutIconKey}
        iconUri={shortcutIconUri}
        isVisible={shortcutModalVisible}
        name={shortcutName}
        onChangeIconUri={setShortcutIconUri}
        onChangeName={setShortcutName}
        onChangeWebsite={setShortcutWebsite}
        onClose={closeShortcutModal}
        onDelete={deleteCustomShortcut}
        onPickIcon={pickShortcutIcon}
        onSave={saveCustomShortcut}
        website={shortcutWebsite}
      />
      <AppSplashOverlay visible={!appSplashReleased} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#070707",
    flex: 1,
    gap: 12,
    paddingBottom: 14,
  },
  deviceDropdownDismissLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 40,
  },
  remoteControls: {
    flex: 1,
    gap: 12,
    minHeight: 0,
    position: "relative",
  },
  trackpadWrap: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  trackpadTourTarget: {
    flex: 1,
    minHeight: 0,
  },
});
