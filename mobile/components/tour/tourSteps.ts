import type { HostCapabilities, HostPlatform } from "../../types/protocol";
import type { TourStep } from "./tourTypes";

interface CreateTourStepsInput {
  capabilities: HostCapabilities | null;
  closeKeyboard: () => void;
  closeSettings: () => void;
  platform: HostPlatform | null;
}

const STEP_DELAY_MS = 80;

export function createAppTourSteps({
  capabilities,
  closeKeyboard,
  closeSettings,
  platform,
}: CreateTourStepsInput): TourStep[] {
  const isWindows = platform === "win32";
  const supportsWake = capabilities?.sleep === true;
  const supportsMissionControl =
    platform === "darwin" && capabilities?.showOverview === true;
  const supportsMediaControls = true;
  const supportsBrightness = capabilities?.brightness === true;
  const supportsVolume = capabilities?.volume === true;
  const settingsSystemFeature =
    supportsBrightness || supportsVolume
      ? "Control brightness and volume when the connected display supports them."
      : "Unsupported system controls stay visibly disabled.";

  return [
    {
      id: "trackpad",
      title: "Trackpad",
      description: "Move the pointer and click directly from your phone.",
      features: [
        "Swipe on the trackpad to move the pointer.",
        "Tap, double-tap, or two-finger tap for pointer actions.",
        "Keep the main pad clear for broad pointer movement.",
      ],
      targetKey: "trackpad",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "scroll-handle",
      title: "Scroll Handle",
      description:
        "Drag the handle to scroll without giving up trackpad space.",
      features: [
        "Drag vertically to scroll up and down.",
        "Drag horizontally when the active app supports side-to-side scrolling.",
        "Long-press first to reposition the handle intentionally.",
      ],
      targetKey: "scroll-handle",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "device-switcher",
      title: "Switch Devices",
      description:
        "Quickly switch between paired computers without reconnecting each time.",
      features: [
        "See the currently connected device.",
        "Switch between saved Mac and Windows devices.",
        "Connection status stays visible while switching.",
      ],
      targetKey: "device-switch",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "scan-qr-code",
      title: "Connect a New Device",
      description:
        "Scan the QR code shown by the desktop app to pair a new computer.",
      features: [
        "Open the camera scanner.",
        "Pair securely with the desktop companion app.",
        "See clear success and error feedback.",
      ],
      targetKey: "scan-qr",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "settings-entry",
      title: "Adjust Your Controls",
      description:
        "Open Settings when you want to personalize how the remote feels.",
      features: [
        "Fine-tune pointer sensitivity and scrolling direction.",
        settingsSystemFeature,
        "Review which controls are supported by the active device.",
      ],
      targetKey: "settings-button",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "lock-wake-screen",
      title: "Lock or Wake Your Computer",
      description:
        supportsWake
          ? "Lock the connected computer or wake it when your setup supports it."
          : "Lock the connected computer when the current platform supports it.",
      features: [
        "Lock or sleep the active computer.",
        supportsWake
          ? "Wake works when the platform and network configuration allow it."
          : "Wake is hidden when the connected platform does not report support.",
        "Potentially disruptive actions stay behind explicit controls.",
      ],
      targetKey: "sleep-control",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "shortcuts",
      title: "Custom Shortcuts",
      description: "Launch your most-used commands with a single tap.",
      features: [
        "Tap a shortcut to run it.",
        "Long-press a custom shortcut to edit it.",
        "Add new shortcuts with recognizable icons.",
      ],
      targetKey: "shortcuts",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "action-buttons",
      title: "Action Buttons",
      description: isWindows
        ? "Send common Windows and browser commands without leaving the trackpad."
        : "Move between macOS spaces, browser pages, and media moments fast.",
      features: isWindows
        ? [
            "Send Escape or close the current browser tab.",
            "Go back or forward in the browser.",
            "Rewind or fast-forward media with arrow controls.",
          ]
        : [
            "Toggle between windows or spaces.",
            "Go back or forward in the browser.",
            "Rewind or fast-forward media with arrow controls.",
          ],
      targetKey: "shortcut-actions",
      placement: "bottom",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    ...(platform === "darwin"
      ? [
          {
            id: "mac-action-buttons",
            title: "Mac Controls",
            description:
              "Reach Escape, Mission Control, media playback, and tab closing near the trackpad.",
            features: [
              "Send Escape.",
              supportsMissionControl
                ? "Open Mission Control."
                : "Mission Control stays disabled when unavailable.",
              supportsMediaControls
                ? "Pause or resume media."
                : "Media controls appear only when supported.",
              "Close the current browser tab.",
            ],
            targetKey: "mac-actions",
            placement: "top",
            beforeShow: async () => {
              closeSettings();
              closeKeyboard();
              await wait(STEP_DELAY_MS);
            },
          } satisfies TourStep,
        ]
      : []),
    {
      id: "reload-right-click",
      title: "More Pointer Actions",
      description:
        "Reload the active page or perform a right-click without touching the computer.",
      features: [
        "Refresh the active browser page.",
        "Perform a right-click.",
        "Keep these separate from normal trackpad clicking.",
      ],
      targetKey: "mouse-actions",
      placement: "top",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
    {
      id: "keyboard",
      title: "Remote Keyboard",
      description:
        "Open the mobile keyboard and type directly on the connected computer.",
      features: [
        "Send typed text to the active device.",
        "Use common keys like Enter, Delete, Escape, and arrow keys where implemented.",
        "Keyboard tools stay unavailable when the connection is unavailable.",
      ],
      targetKey: "keyboard-button",
      placement: "top",
      beforeShow: async () => {
        closeSettings();
        closeKeyboard();
        await wait(STEP_DELAY_MS);
      },
    },
  ];
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
