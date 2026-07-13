import { Ionicons } from "@expo/vector-icons";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { withHaptic } from "../../utils/haptics";

interface ShortcutEditorModalProps {
  editingShortcutId: string | null;
  formError: string;
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

export function ShortcutEditorModal({
  editingShortcutId,
  formError,
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
  return (
    <Modal
      animationType="fade"
      transparent
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.shortcutModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingShortcutId ? "Edit Shortcut" : "Add Shortcut"}
            </Text>
            <Pressable
              style={styles.modalIconButton}
              onPress={withHaptic(onClose)}
            >
              <Ionicons name="close" size={22} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={onChangeName}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Netflix"
              placeholderTextColor="#756f68"
              style={styles.formInput}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Website</Text>
            <TextInput
              value={website}
              onChangeText={onChangeWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="netflix.com"
              placeholderTextColor="#756f68"
              style={styles.formInput}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Icon</Text>
            <View style={styles.iconUploadRow}>
              <View style={styles.iconPreview}>
                {iconUri ? (
                  <Image source={{ uri: iconUri }} style={styles.iconPreviewImage} />
                ) : (
                  <Text style={styles.iconPreviewText}>
                    {(name.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                )}
              </View>
              <Pressable
                style={styles.uploadButton}
                onPress={withHaptic(onPickIcon)}
              >
                <Ionicons name="image-outline" size={20} color="#ffffff" />
                <Text style={styles.uploadButtonText}>Upload Image</Text>
              </Pressable>
            </View>
            {iconUri ? (
              <Pressable
                style={styles.removeIconButton}
                onPress={withHaptic(() => onChangeIconUri(undefined))}
              >
                <Text style={styles.removeIconText}>Remove Image</Text>
              </Pressable>
            ) : null}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          {editingShortcutId ? (
            <Pressable
              style={styles.deleteShortcutButton}
              onPress={withHaptic(onDelete)}
            >
              <Ionicons name="trash-outline" size={20} color="#ffb4b4" />
              <Text style={styles.deleteShortcutText}>Delete Shortcut</Text>
            </Pressable>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalActionButton, styles.cancelButton]}
              onPress={withHaptic(onClose)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalActionButton, styles.saveButton]}
              onPress={withHaptic(onSave)}
            >
              <Text style={styles.saveButtonText}>
                {editingShortcutId ? "Save" : "Add"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  shortcutModal: {
    backgroundColor: "#14110f",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  modalIconButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
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
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  iconUploadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  iconPreview: {
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    borderColor: "#2a2118",
    borderRadius: 8,
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
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: "#211a14",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  removeIconButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  removeIconText: {
    color: "#ff941f",
    fontSize: 13,
    fontWeight: "800",
  },
  formError: {
    color: "#ff8a8a",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteShortcutButton: {
    alignItems: "center",
    backgroundColor: "#32191d",
    borderColor: "#5b2730",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  deleteShortcutText: {
    color: "#ffb4b4",
    fontSize: 15,
    fontWeight: "900",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalActionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  cancelButton: {
    backgroundColor: "#211a14",
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  saveButton: {
    backgroundColor: "#ff941f",
  },
  saveButtonText: {
    color: "#1b1008",
    fontSize: 15,
    fontWeight: "900",
  },
});
