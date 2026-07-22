import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  CUSTOM_SHORTCUTS_STORAGE_KEY,
  EDITABLE_SHORTCUT_DEFAULTS_MIGRATED_KEY,
} from "./storageKeys";
import { normalizeWebsiteUrl, parseCustomShortcuts } from "./shortcutUtils";
import type { CustomShortcut, PresetIconKey } from "./types";
import { DEFAULT_EDITABLE_SHORTCUTS } from "./predefinedShortcuts";

export function useCustomShortcuts() {
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>(
    DEFAULT_EDITABLE_SHORTCUTS,
  );
  const [shortcutModalVisible, setShortcutModalVisible] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(
    null,
  );
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutWebsite, setShortcutWebsite] = useState("");
  const [shortcutIconUri, setShortcutIconUri] = useState<string | undefined>();
  const [shortcutFormError, setShortcutFormError] = useState("");
  const shortcutIconKey: PresetIconKey | undefined = editingShortcutId
    ? customShortcuts.find((shortcut) => shortcut.id === editingShortcutId)
        ?.iconKey
    : undefined;

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.multiGet([
      CUSTOM_SHORTCUTS_STORAGE_KEY,
      EDITABLE_SHORTCUT_DEFAULTS_MIGRATED_KEY,
    ])
      .then((entries) => {
        if (cancelled) {
          return;
        }

        const saved = entries.find(
          ([key]) => key === CUSTOM_SHORTCUTS_STORAGE_KEY,
        )?.[1];
        const migrated = entries.find(
          ([key]) => key === EDITABLE_SHORTCUT_DEFAULTS_MIGRATED_KEY,
        )?.[1];

        if (!saved) {
          persistCustomShortcuts(DEFAULT_EDITABLE_SHORTCUTS);
          markDefaultShortcutMigrationComplete();
          return;
        }

        const parsedShortcuts = parseCustomShortcuts(saved);

        if (migrated === "true") {
          setCustomShortcuts(parsedShortcuts);
          return;
        }

        const migratedShortcuts = mergeDefaultShortcuts(parsedShortcuts);

        persistCustomShortcuts(migratedShortcuts);
        markDefaultShortcutMigrationComplete();
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
      iconKey: customShortcuts.find(
        (shortcut) => shortcut.id === editingShortcutId,
      )?.iconKey,
      shortcutId: customShortcuts.find(
        (shortcut) => shortcut.id === editingShortcutId,
      )?.shortcutId,
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
    shortcutIconKey,
    shortcutIconUri,
    shortcutModalVisible,
    shortcutName,
    shortcutWebsite,
  };
}

function markDefaultShortcutMigrationComplete() {
  AsyncStorage.setItem(EDITABLE_SHORTCUT_DEFAULTS_MIGRATED_KEY, "true").catch(
    () => {
      // Ignore storage errors.
    },
  );
}

function mergeDefaultShortcuts(shortcuts: CustomShortcut[]): CustomShortcut[] {
  const existingIds = new Set(shortcuts.map((shortcut) => shortcut.id));
  const missingDefaults = DEFAULT_EDITABLE_SHORTCUTS.filter(
    (shortcut) => !existingIds.has(shortcut.id),
  );

  return [...shortcuts, ...missingDefaults];
}
