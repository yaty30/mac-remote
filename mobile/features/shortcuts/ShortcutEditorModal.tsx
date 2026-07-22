import { Ionicons } from "@expo/vector-icons";
import {
  ImagePlus,
  Layers2,
  Save,
  X,
} from "lucide-react-native";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScanGradientButton } from "../../components/GradientButton";
import { withHaptic } from "../../utils/haptics";
import DisneyPlusIcon from "../../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../../assets/shortcuts/netflix.svg";
import PrimeIcon from "../../assets/shortcuts/prime.svg";
import SpotifyIcon from "../../assets/shortcuts/spotify.svg";
import type { PresetIconKey } from "./types";

interface ShortcutEditorModalProps {
  editingShortcutId: string | null;
  formError: string;
  iconKey?: PresetIconKey;
  iconUri?: string;
  isVisible: boolean;
  name: string;
  onChangeIconUri: (iconUri: string | undefined) => void;
  onChangeName: (name: string) => void;
  onChangeWebsite: (website: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onPickIcon: () => void;
  onSave: () => void;
  website: string;
}

const PRIMARY_GRADIENT = [
  "rgba(44, 33, 23, 0.92)",
  "rgba(24, 20, 16, 0.94)",
  "rgba(14, 13, 11, 0.96)",
] as const;

const SECONDARY_GRADIENT = [
  "rgba(38, 35, 32, 0.94)",
  "rgba(24, 22, 20, 0.96)",
  "rgba(14, 14, 13, 0.98)",
] as const;

const DANGER_GRADIENT = [
  "#4b211c",
  "#321917",
  "#1b1110",
] as const;

const GRADIENT_START = { x: 0.1, y: 0 };
const GRADIENT_END = { x: 0.9, y: 1 };

export function ShortcutEditorModal({
  editingShortcutId,
  formError,
  iconKey,
  iconUri,
  isVisible,
  name,
  onChangeIconUri,
  onChangeName,
  onChangeWebsite,
  onClose,
  onDelete,
  onPickIcon,
  onSave,
  website,
}: ShortcutEditorModalProps) {
  const isEditing = editingShortcutId !== null;
  const actionLabel = isEditing ? "Save" : "Add";
  const presetIcon = getPresetIconPreview(iconKey);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.shortcutModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <View style={styles.modalTitleIcon}>
                <Layers2
                  color="#f0a942"
                  size={19}
                  strokeWidth={2.2}
                />
              </View>

              <Text style={styles.modalTitle}>
                {isEditing ? "Edit Shortcut" : "Add Shortcut"}
              </Text>
            </View>

            <ScanGradientButton
              accessibilityLabel="Close shortcut editor"
              action={onClose}
              buttonStyle={styles.panelClose}
              colors={DANGER_GRADIENT}
              end={GRADIENT_END}
              gradientStyle={styles.panelCloseGradient}
              icon={
                <Ionicons
                  color="#ff8a72"
                  name="close"
                  size={20}
                />
              }
              pressedStyle={styles.buttonPressed}
              start={GRADIENT_START}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Name</Text>

            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={onChangeName}
              placeholder="Netflix"
              placeholderTextColor="#756f68"
              selectionColor="#f0a942"
              style={styles.formInput}
              value={name}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Website</Text>

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={onChangeWebsite}
              placeholder="netflix.com"
              placeholderTextColor="#756f68"
              selectionColor="#f0a942"
              style={styles.formInput}
              value={website}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Icon</Text>

            <View style={styles.iconUploadRow}>
              <View style={styles.iconPreview}>
                {iconUri ? (
                  <Image
                    resizeMode="cover"
                    source={{ uri: iconUri }}
                    style={styles.iconPreviewImage}
                  />
                ) : presetIcon ? (
                  presetIcon
                ) : (
                  <Text style={styles.iconPreviewText}>
                    {(name.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                )}
              </View>

              <ScanGradientButton
                accessibilityLabel="Upload shortcut image"
                action={onPickIcon}
                buttonStyle={[
                  styles.premiumButton,
                  styles.uploadButton,
                ]}
                colors={SECONDARY_GRADIENT}
                end={GRADIENT_END}
                gradientStyle={styles.premiumButtonGradient}
                icon={
                  <ImagePlus
                    color="#e9e4dd"
                    size={20}
                    strokeWidth={2.2}
                  />
                }
                label={iconUri ? "Change Image" : "Upload Image"}
                labelStyle={styles.secondaryButtonText}
                pressedStyle={styles.buttonPressed}
                start={GRADIENT_START}
              />
            </View>

            {iconUri ? (
              <Pressable
                accessibilityLabel="Remove shortcut image"
                accessibilityRole="button"
                onPress={withHaptic(() =>
                  onChangeIconUri(undefined)
                )}
                style={({ pressed }) => [
                  styles.removeIconButton,
                  pressed && styles.removeIconButtonPressed,
                ]}
              >
                <Ionicons
                  color="#ff9f4a"
                  name="close-circle-outline"
                  size={16}
                />

                <Text style={styles.removeIconText}>
                  Remove Image
                </Text>
              </Pressable>
            ) : null}
          </View>

          {formError ? (
            <View style={styles.formErrorContainer}>
              <Ionicons
                color="#ff8a8a"
                name="alert-circle-outline"
                size={17}
              />

              <Text style={styles.formError}>
                {formError}
              </Text>
            </View>
          ) : null}

          {isEditing ? (
            <Pressable
              accessibilityLabel="Delete shortcut"
              accessibilityRole="button"
              onPress={withHaptic(onDelete)}
              style={({ pressed }) => [
                styles.deleteShortcutButton,
                pressed && styles.deleteShortcutButtonPressed,
              ]}
            >
              <Ionicons
                color="#ffaaa5"
                name="trash-outline"
                size={19}
              />

              <Text style={styles.deleteShortcutText}>
                Delete Shortcut
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.modalActions}>
            <ScanGradientButton
              accessibilityLabel="Cancel shortcut changes"
              action={onClose}
              buttonStyle={[
                styles.premiumButton,
                styles.modalActionButton,
                styles.cancelButton,
              ]}
              colors={SECONDARY_GRADIENT}
              end={GRADIENT_END}
              gradientStyle={styles.premiumButtonGradient}
              icon={
                <X
                  color="#c8c3bc"
                  size={20}
                  strokeWidth={2.3}
                />
              }
              label="Cancel"
              labelStyle={styles.cancelButtonText}
              pressedStyle={styles.buttonPressed}
              start={GRADIENT_START}
            />

            <ScanGradientButton
              accessibilityLabel={
                isEditing ? "Save shortcut" : "Add shortcut"
              }
              action={onSave}
              buttonStyle={[
                styles.premiumButton,
                styles.modalActionButton,
                styles.primaryButton,
              ]}
              colors={PRIMARY_GRADIENT}
              end={GRADIENT_END}
              gradientStyle={styles.premiumButtonGradient}
              icon={
                <Save
                  color="#f0a942"
                  size={21}
                  strokeWidth={2.3}
                />
              }
              label={actionLabel}
              labelStyle={styles.primaryButtonText}
              pressedStyle={styles.buttonPressed}
              start={GRADIENT_START}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getPresetIconPreview(iconKey?: PresetIconKey) {
  const iconSize = 32;

  switch (iconKey) {
    case "netflix":
      return <NetflixIcon width={iconSize} height={iconSize} />;
    case "youtube":
      return <Ionicons name="logo-youtube" size={34} color="#ff0033" />;
    case "disney":
      return <DisneyPlusIcon width={iconSize} height={iconSize} />;
    case "amazon":
      return <PrimeIcon width={iconSize} height={iconSize} />;
    case "spotify":
      return <SpotifyIcon width={iconSize} height={iconSize} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.82)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },

  shortcutModal: {
    backgroundColor: "#14110f",
    borderColor: "rgba(240, 169, 66, 0.16)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 16,
    maxWidth: 480,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 20,
    },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    width: "100%",
  },

  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  modalTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },

  modalTitleIcon: {
    alignItems: "center",
    backgroundColor: "rgba(44, 33, 23, 0.86)",
    borderColor: "rgba(240, 169, 66, 0.32)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  modalTitle: {
    color: "#ffffff",
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
  },

  panelClose: {
    backgroundColor: "#211811",
    borderColor: "rgba(255, 138, 114, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    width: 36,
  },

  panelCloseGradient: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },

  formField: {
    gap: 8,
  },

  formLabel: {
    color: "#cec8be",
    fontSize: 13,
    fontWeight: "800",
  },

  formInput: {
    backgroundColor: "rgba(10, 10, 10, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },

  iconUploadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },

  iconPreview: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "rgba(240, 169, 66, 0.2)",
    borderRadius: 13,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    width: 56,
  },

  iconPreviewImage: {
    height: "100%",
    width: "100%",
  },

  iconPreviewText: {
    color: "#f0a942",
    fontSize: 24,
    fontWeight: "900",
  },

  premiumButton: {
    borderRadius: 14,
    borderWidth: 1,
    elevation: 4,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },

  premiumButtonGradient: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  uploadButton: {
    backgroundColor: "rgba(22, 21, 19, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    flex: 1,
    minHeight: 50,
  },

  secondaryButtonText: {
    color: "#e9e4dd",
    fontSize: 15,
    fontWeight: "900",
  },

  removeIconButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },

  removeIconButtonPressed: {
    backgroundColor: "rgba(255, 148, 31, 0.1)",
    opacity: 0.82,
  },

  removeIconText: {
    color: "#ff9f4a",
    fontSize: 13,
    fontWeight: "800",
  },

  formErrorContainer: {
    alignItems: "center",
    backgroundColor: "rgba(85, 30, 30, 0.32)",
    borderColor: "rgba(255, 138, 138, 0.2)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  formError: {
    color: "#ff9c9c",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },

  deleteShortcutButton: {
    alignItems: "center",
    backgroundColor: "rgba(55, 24, 27, 0.72)",
    borderColor: "rgba(255, 115, 115, 0.26)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },

  deleteShortcutButtonPressed: {
    backgroundColor: "rgba(73, 29, 34, 0.86)",
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },

  deleteShortcutText: {
    color: "#ffaaa5",
    fontSize: 15,
    fontWeight: "900",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
  },

  modalActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
  },

  cancelButton: {
    backgroundColor: "rgba(22, 21, 19, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.14)",
  },

  cancelButtonText: {
    color: "#c8c3bc",
    fontSize: 15,
    fontWeight: "900",
  },

  primaryButton: {
    backgroundColor: "rgba(31, 25, 18, 0.9)",
    borderColor: "rgba(240, 169, 66, 0.62)",
  },

  primaryButtonText: {
    color: "#f0a942",
    fontSize: 15,
    fontWeight: "900",
  },

  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
