import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { CUSTOM_SHORTCUTS_STORAGE_KEY } from "./storageKeys";
import { normalizeWebsiteUrl, parseCustomShortcuts } from "./shortcutUtils";
import type { CustomShortcut } from "./types";

export function useCustomShortcuts() {
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>([]);
  const [shortcutModalVisible, setShortcutModalVisible] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(
    null,
  );
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutWebsite, setShortcutWebsite] = useState("");
  const [shortcutIconUri, setShortcutIconUri] = useState<string | undefined>();
  const [shortcutFormError, setShortcutFormError] = useState("");

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(CUSTOM_SHORTCUTS_STORAGE_KEY)
      .then((saved) => {
        if (cancelled || !saved) {
          return;
        }

        setCustomShortcuts(parseCustomShortcuts(saved));
      })
      .catch(() => {
        // Ignore storage errors.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openShortcutModal() {
    setEditingShortcutId(null);
    setShortcutName("");
    setShortcutWebsite("");
    setShortcutIconUri(undefined);
    setShortcutFormError("");
    setShortcutModalVisible(true);
  }

  function openEditShortcutModal(shortcut: CustomShortcut) {
    setEditingShortcutId(shortcut.id);
    setShortcutName(shortcut.name);
    setShortcutWebsite(shortcut.url);
    setShortcutIconUri(shortcut.iconUri);
    setShortcutFormError("");
    setShortcutModalVisible(true);
  }

  function closeShortcutModal() {
    setShortcutModalVisible(false);
    setEditingShortcutId(null);
    setShortcutFormError("");
  }

  async function pickShortcutIcon() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setShortcutFormError(
        "Photo library permission is required to upload an icon.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setShortcutIconUri(result.assets[0].uri);
      setShortcutFormError("");
    }
  }

  function saveCustomShortcut() {
    const name = shortcutName.trim();
    const url = normalizeWebsiteUrl(shortcutWebsite);

    if (!name) {
      setShortcutFormError("Enter a shortcut name.");
      return;
    }

    if (!url) {
      setShortcutFormError("Enter a valid website.");
      return;
    }

    const nextShortcut = {
      id: editingShortcutId ?? `${Date.now()}`,
      name: name.slice(0, 40),
      url,
      iconUri: shortcutIconUri,
    };
    const nextShortcuts = editingShortcutId
      ? customShortcuts.map((shortcut) =>
          shortcut.id === editingShortcutId ? nextShortcut : shortcut,
        )
      : [...customShortcuts, nextShortcut];

    persistCustomShortcuts(nextShortcuts);
    closeShortcutModal();
  }

  function deleteCustomShortcut() {
    if (!editingShortcutId) {
      return;
    }

    persistCustomShortcuts(
      customShortcuts.filter((shortcut) => shortcut.id !== editingShortcutId),
    );
    closeShortcutModal();
  }

  function persistCustomShortcuts(nextShortcuts: CustomShortcut[]) {
    setCustomShortcuts(nextShortcuts);
    AsyncStorage.setItem(
      CUSTOM_SHORTCUTS_STORAGE_KEY,
      JSON.stringify(nextShortcuts),
    ).catch(() => {
      // Ignore storage errors.
    });
  }

  return {
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
    shortcutIconUri,
    shortcutModalVisible,
    shortcutName,
    shortcutWebsite,
  };
}
