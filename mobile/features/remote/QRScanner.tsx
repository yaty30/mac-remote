import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import {
  CameraView,
  type ScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { QrCode } from "lucide-react-native";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { HeaderGradientButton, ScanGradientButton } from "../../components/GradientButton";
import { TourTarget } from "../../components/tour/TourTarget";
import { withHaptic } from "../../utils/haptics";
import { parsePairingPayload } from "../connection/pairing";

export interface QRScannerHandle {
  open: () => Promise<void>;
}

interface QRScannerProps {
  onConnectToHost: (
    url: string,
    hostName?: string,
    pairingToken?: string,
  ) => void;
  onOpenStart?: () => void;
  onScanError: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

export const QRScanner = forwardRef<QRScannerHandle, QRScannerProps>(
  (
    {
      onConnectToHost,
      onOpenStart,
      onScanError,
      onVisibilityChange,
    },
    ref,
  ) => {
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const scannerOpenRef = useRef(false);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [visible, setVisible] = useState(false);
    const [zoom, setZoom] = useState(0.2);
    const cameraSize = Math.max(
      240,
      Math.min(windowWidth - 64, windowHeight - 236, 420),
    );

    useImperativeHandle(ref, () => ({ open: openScanner }));

    async function openScanner() {
      const permission =
        cameraPermission?.granted === true
          ? cameraPermission
          : await requestCameraPermission();

      if (!permission.granted) {
        onScanError();
        return;
      }

      scannerOpenRef.current = true;
      onOpenStart?.();
      setVisible(true);
      onVisibilityChange?.(true);
    }

    function closeScanner() {
      scannerOpenRef.current = false;
      setVisible(false);
      onVisibilityChange?.(false);
    }

    function handleBarcodeScanned(event: Pick<ScanningResult, "data">) {
      if (!scannerOpenRef.current) {
        return;
      }

      scannerOpenRef.current = false;
      setVisible(false);
      onVisibilityChange?.(false);

      const pairing = parsePairingPayload(event.data);

      if (!pairing) {
        onScanError();
        return;
      }

      onConnectToHost(pairing.url, pairing.hostName, pairing.pairingToken);
    }

  return (
    <>
      <TourTarget targetKey="scan-qr">
        <HeaderGradientButton
          accessibilityLabel="Scan QR code"
          action={openScanner}
          buttonStyle={[styles.headerActionButton, styles.scanButton]}
          gradientStyle={styles.headerActionGradient}
          icon={<QrCode size={20} color="#f0a942" />}
          pressedStyle={styles.headerActionButtonPressed}
        />
      </TourTarget>

      <Modal
        animationType="fade"
        transparent
        visible={visible}
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerBackdrop}>
          <View style={styles.scannerSheet}>
            <View style={styles.scannerHeader}>
              <View style={styles.scannerTitleRow}>
                <View style={styles.scannerIcon}>
                  <View style={styles.keyboardPanelIconGradient}>
                    <QrCode size={18} color="#f0a942" />
                  </View>
                </View>
                <Text style={styles.scannerTitle}>Scan Desktop QR</Text>
              </View>

              <ScanGradientButton
                accessibilityLabel="Close qrcode scanner"
                action={withHaptic(closeScanner)}
                buttonStyle={styles.keyboardPanelClose}
                colors={["#4b211c", "#321917", "#1b1110"]}
                gradientStyle={styles.keyboardPanelCloseGradient}
                icon={<Ionicons name="close" size={20} color="#ff8a72" />}
                pressedStyle={styles.keyboardPanelClosePressed}
              />
            </View>

            <View
              style={[
                styles.scannerCameraFrame,
                {
                  height: cameraSize,
                  width: cameraSize,
                },
              ]}
            >
              <CameraView
                active={visible}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                facing="back"
                onBarcodeScanned={visible ? handleBarcodeScanned : undefined}
                style={styles.scannerCamera}
                zoom={zoom}
              />
              <View pointerEvents="none" style={styles.scannerGuide}>
                <View style={[styles.scannerCorner, styles.scannerCornerTopLeft]} />
                <View style={[styles.scannerCorner, styles.scannerCornerTopRight]} />
                <View
                  style={[styles.scannerCorner, styles.scannerCornerBottomLeft]}
                />
                <View
                  style={[styles.scannerCorner, styles.scannerCornerBottomRight]}
                />
              </View>
            </View>

            <View style={styles.scannerZoomRow}>
              <Ionicons name="remove" size={18} color="#cec8be" />
              <Slider
                style={styles.scannerZoomSlider}
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={zoom}
                minimumTrackTintColor="#ff941f"
                maximumTrackTintColor="#33261b"
                thumbTintColor="#ffffff"
                onValueChange={setZoom}
              />
              <Ionicons name="add" size={18} color="#cec8be" />
              <Text style={styles.scannerZoomText}>
                {Math.round(zoom * 100)}%
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
  },
);

const baseHeaderActionButton: StyleProp<ViewStyle> = {
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
};

const styles = StyleSheet.create({
  headerActionButton: baseHeaderActionButton as ViewStyle,
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  scanButton: {
    borderColor: "rgba(240, 169, 66, 0.42)",
  },
  headerActionGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  scannerBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.86)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  scannerSheet: {
    alignItems: "stretch",
    backgroundColor: "#14110f",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 520,
    padding: 14,
    width: "100%",
  },
  scannerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scannerTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  scannerIcon: {
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
  scannerTitle: {
    color: "#ffffff",
    fontSize: 17,
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
  scannerCameraFrame: {
    alignSelf: "center",
    backgroundColor: "#070707",
    borderColor: "#33261b",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  scannerCamera: {
    ...StyleSheet.absoluteFill,
  },
  scannerGuide: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  scannerCorner: {
    borderColor: "#ff941f",
    height: 42,
    position: "absolute",
    width: 42,
  },
  scannerCornerTopLeft: {
    borderLeftWidth: 4,
    borderTopWidth: 4,
    left: "24%",
    top: "24%",
  },
  scannerCornerTopRight: {
    borderRightWidth: 4,
    borderTopWidth: 4,
    right: "24%",
    top: "24%",
  },
  scannerCornerBottomLeft: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    bottom: "24%",
    left: "24%",
  },
  scannerCornerBottomRight: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
    bottom: "24%",
    right: "24%",
  },
  scannerZoomRow: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  scannerZoomSlider: {
    flex: 1,
    height: 36,
  },
  scannerZoomText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    minWidth: 38,
    textAlign: "right",
  },
});
