import type {
  PredefinedShortcut,
  PresetIconKey,
} from "./types";
import type { ShortcutId } from "../../types/protocol";

interface PredefinedShortcutDefinition {
  id: string;
  iconKey: PresetIconKey;
  name: string;
  shortcutId: ShortcutId;
  website: string;
}

export const PREDEFINED_SHORTCUTS: PredefinedShortcutDefinition[] = [
  {
    id: "predefined-netflix",
    iconKey: "netflix",
    name: "Netflix",
    shortcutId: "netflix",
    website: "https://www.netflix.com",
  },
  {
    id: "predefined-youtube",
    iconKey: "youtube",
    name: "YouTube",
    shortcutId: "youtube",
    website: "https://www.youtube.com",
  },
  {
    id: "predefined-disney",
    iconKey: "disney",
    name: "Disney+",
    shortcutId: "disney",
    website: "https://www.disneyplus.com",
  },
  {
    id: "predefined-amazon",
    iconKey: "amazon",
    name: "Amazon Prime",
    shortcutId: "amazon",
    website: "https://www.primevideo.com",
  },
  {
    id: "predefined-spotify",
    iconKey: "spotify",
    name: "Spotify",
    shortcutId: "spotify",
    website: "https://open.spotify.com",
  },
];

export function createPredefinedShortcut(
  definition: PredefinedShortcutDefinition,
): PredefinedShortcut {
  return {
    ...definition,
    kind: "predefined",
    defaultName: definition.name,
    defaultWebsite: definition.website,
  };
}