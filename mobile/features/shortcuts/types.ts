import type { ShortcutId } from "../../types/protocol";

export type PresetIconKey =
  | "amazon"
  | "disney"
  | "netflix"
  | "spotify"
  | "youtube";

export interface CustomShortcut {
  id: string;
  name: string;
  url: string;
  iconUri?: string;
  iconKey?: PresetIconKey;
  shortcutId?: ShortcutId;
}

export interface PredefinedShortcut extends CustomShortcut {
  defaultName: string;
  defaultWebsite: string;
  iconKey: PresetIconKey;
  kind: "predefined";
  shortcutId: ShortcutId;
}
