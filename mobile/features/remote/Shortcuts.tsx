import { ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { TourTarget } from "../../components/tour/TourTarget";
import { ShortcutButton } from "../../components/ShortcutButton";
import DisneyPlusIcon from "../../assets/shortcuts/disneyplus.svg";
import NetflixIcon from "../../assets/shortcuts/netflix.svg";
import PrimeIcon from "../../assets/shortcuts/prime.svg";
import SpotifyIcon from "../../assets/shortcuts/spotify.svg";
import type { CustomShortcut, PresetIconKey } from "../shortcuts/types";

const SHORTCUT_GAP = 8;
const BODY_HORIZONTAL_PADDING = 10;
const SHORTCUT_VISIBLE_COUNT = 5;
const SHORTCUT_MIN_SIZE = 54;
const SHORTCUT_MAX_SIZE = 70;

interface ShortcutsProps {
  onAddShortcut: () => void;
  onEditShortcut: (shortcut: CustomShortcut) => void;
  onShortcutPress: (shortcut: CustomShortcut) => void;
  shortcuts: CustomShortcut[];
}

export function Shortcuts({
  onAddShortcut,
  onEditShortcut,
  onShortcutPress,
  shortcuts,
}: ShortcutsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const buttonSize = clamp(
    Math.floor(
      (windowWidth -
        BODY_HORIZONTAL_PADDING * 2 -
        SHORTCUT_GAP * (SHORTCUT_VISIBLE_COUNT - 1)) /
        SHORTCUT_VISIBLE_COUNT,
    ),
    SHORTCUT_MIN_SIZE,
    SHORTCUT_MAX_SIZE,
  );

  return (
    <TourTarget targetKey="shortcuts">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.shortcutsScroller, { height: buttonSize }]}
        contentContainerStyle={styles.shortcuts}
      >
        {shortcuts.map((shortcut) => (
          <ShortcutItem
            key={shortcut.id}
            buttonSize={buttonSize}
            onEditShortcut={onEditShortcut}
            onShortcutPress={onShortcutPress}
            shortcut={shortcut}
          />
        ))}
        <ShortcutButton
          icon="add"
          iconColor="#ff941f"
          label="Add Shortcut"
          onPress={onAddShortcut}
          size={buttonSize}
        />
      </ScrollView>
    </TourTarget>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ShortcutItem({
  buttonSize,
  onEditShortcut,
  onShortcutPress,
  shortcut,
}: {
  buttonSize: number;
  onEditShortcut: (shortcut: CustomShortcut) => void;
  onShortcutPress: (shortcut: CustomShortcut) => void;
  shortcut: CustomShortcut;
}) {
  const iconProps = getShortcutIconProps(shortcut);
  const hasIcon =
    "SvgIcon" in iconProps || "icon" in iconProps || "imageUri" in iconProps;

  return (
    <ShortcutButton
      {...iconProps}
      initial={hasIcon ? undefined : shortcut.name}
      label={shortcut.name}
      onPress={() => onShortcutPress(shortcut)}
      onLongPress={() => onEditShortcut(shortcut)}
      size={buttonSize}
    />
  );
}

function getShortcutIconProps(shortcut: CustomShortcut) {
  if (shortcut.iconUri) {
    return { imageUri: shortcut.iconUri };
  }

  switch (shortcut.iconKey as PresetIconKey | undefined) {
    case "netflix":
      return { SvgIcon: NetflixIcon };
    case "youtube":
      return { icon: "logo-youtube" as const, iconColor: "#ff0033" };
    case "disney":
      return { SvgIcon: DisneyPlusIcon };
    case "amazon":
      return { SvgIcon: PrimeIcon };
    case "spotify":
      return { SvgIcon: SpotifyIcon };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  shortcuts: {
    flexDirection: "row",
    flexShrink: 0,
    gap: SHORTCUT_GAP,
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
  },
  shortcutsScroller: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
  },
});
