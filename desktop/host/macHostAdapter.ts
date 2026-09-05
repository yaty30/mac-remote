import { existsSync } from "node:fs";
import { join } from "node:path";
import { Key } from "@nut-tree-fork/nut-js";
import type { KeyboardController } from "../mouse-control/keyboardController";
import type { HostCapabilities, ShortcutId, TextCommand } from "../types/protocol";
import { clampPercent, runExecutable } from "./processUtils";
import type {
  DisplayContext,
  DisplayControlCapabilities,
  HostAdapter,
} from "./types";

const BRIGHTNESS_CONTROL_STEPS = 16;
const BRIGHTNESS_TARGET_TOLERANCE = Math.ceil(
  100 / BRIGHTNESS_CONTROL_STEPS / 2,
);
const BRIGHTNESS_CHANGE_TIMEOUT_MS = 700;
const BRIGHTNESS_POLL_INTERVAL_MS = 80;

export class MacHostAdapter implements HostAdapter {
  readonly platform = "darwin" as const;
  private displaySleeping = false;
  private brightnessQueue: Promise<void> = Promise.resolve();

  constructor(private readonly keyboardController: KeyboardController) {}

  getDisplayControlCapabilities(
    context: DisplayContext,
  ): DisplayControlCapabilities {
    return {
      brightnessAdjustable: !context.info.isTv,
      volumeAdjustable: !context.info.isTv,
    };
  }

  getCapabilities(display: {
    brightnessAdjustable: boolean;
    volumeAdjustable: boolean;
  }): HostCapabilities {
    return {
      brightness: display.brightnessAdjustable,
      volume: display.volumeAdjustable,
      switchWorkspace: true,
      switchWindow: true,
      showOverview: true,
      sleep: true,
      restart: true,
    };
  }

  async getDisplayBrightness(): Promise<number | undefined> {
    const output = await runExecutable("ioreg", [
      "-r",
      "-c",
      "AppleBacklightDisplay",
      "-d",
      "4",
    ]);

    return parseBrightnessOutput(output);
  }

  async adjustBrightness(delta: -1 | 1): Promise<void> {
    await this.enqueueBrightnessChange(async () => {
      const currentBrightness = await this.readDisplayBrightnessForChange();
      const targetBrightness = getSteppedBrightnessTarget(
        currentBrightness,
        delta,
      );

      if (targetBrightness === undefined) {
        await applyBrightnessKey(delta, () => this.getDisplayBrightness());
        return;
      }

      await applyBrightnessTarget(
        targetBrightness,
        currentBrightness,
        () => this.getDisplayBrightness(),
      );
    });
  }

  async setBrightness(value: number): Promise<void> {
    const targetBrightness = clampPercent(value);

    await this.enqueueBrightnessChange(async () => {
      const currentBrightness = await this.readDisplayBrightnessForChange();

      await applyBrightnessTarget(
        targetBrightness,
        currentBrightness,
        () => this.getDisplayBrightness(),
      );
    });
  }

  async getOutputVolume(): Promise<number | undefined> {
    const output = await runAppleScriptOutput(
      "output volume of (get volume settings)",
    );
    const volume = Number.parseInt(output.trim(), 10);

    return Number.isFinite(volume) ? clampPercent(volume) : undefined;
  }

  async setVolume(value: number): Promise<void> {
    await runAppleScript(`set volume output volume ${clampPercent(value)}`);
  }

  async textCommand(command: TextCommand): Promise<void> {
    await this.keyboardController.textCommand(command, {
      browser: Key.LeftCmd,
      command: Key.LeftCmd,
    });
  }

  async zoom(direction: "in" | "out"): Promise<void> {
    await this.keyboardController.zoom(direction, Key.LeftCmd);
  }

  async switchWorkspace(direction: "left" | "right"): Promise<void> {
    try {
      await switchMacSpace(direction);
      return;
    } catch (error) {
      console.warn(
        "[mac-host] osascript space switch failed, falling back to nut.js",
        error,
      );
    }

    const arrow = direction === "left" ? Key.Left : Key.Right;
    await this.keyboardController.pressAndRelease(Key.LeftControl, arrow);
  }

  async switchWindow(direction: "next" | "previous"): Promise<void> {
    if (direction === "previous") {
      await this.keyboardController.pressAndRelease(
        Key.LeftCmd,
        Key.LeftShift,
        Key.Tab,
      );
      return;
    }

    await this.keyboardController.pressAndRelease(Key.LeftCmd, Key.Tab);
  }

  async showOverview(): Promise<void> {
    await runAppleScriptKeyCode("126", "control down");
  }

  async runWebsiteShortcut(url: string): Promise<void> {
    await openChromeTabOnce(url, getUrlNeedle(url));
  }

  async runShortcut(shortcut: ShortcutId): Promise<void> {
    switch (shortcut) {
      case "netflix":
        await openChromeTabOnce("https://www.netflix.com", "netflix.com");
        break;
      case "disney":
        await openChromeTabOnce("https://www.disneyplus.com", "disneyplus.com");
        break;
      case "amazon":
        await openMac("Prime Video", ["-a"]);
        break;
      case "youtube":
        await openChromeTabOnce("https://www.youtube.com", "youtube.com");
        break;
      case "spotify":
        await openMac("Spotify", ["-a"]);
        break;
      default: {
        const exhaustive: never = shortcut;
        throw new Error(`Unsupported shortcut: ${exhaustive}`);
      }
    }
  }

  async sleep(): Promise<void> {
    if (this.displaySleeping) {
      await runExecutable("caffeinate", ["-u", "-t", "2"]);
      this.displaySleeping = false;
      return;
    }

    await runExecutable("pmset", ["displaysleepnow"]);
    this.displaySleeping = true;
  }

  async restartHost(): Promise<void> {
    await forceRestartMac();
  }

  private async enqueueBrightnessChange(
    change: () => Promise<void>,
  ): Promise<void> {
    const next = this.brightnessQueue.catch(() => undefined).then(change);
    this.brightnessQueue = next;

    return next;
  }

  private async readDisplayBrightnessForChange(): Promise<number | undefined> {
    try {
      return await this.getDisplayBrightness();
    } catch (error) {
      console.warn("[mac-host] failed to read display brightness", error);
      return undefined;
    }
  }
}

function openMac(target: string, args: string[] = []): Promise<void> {
  return runExecutable("open", [...args, target]).then(() => undefined);
}

function runAppleScript(script: string): Promise<void> {
  return runAppleScriptOutput(script).then(() => undefined);
}

function runAppleScriptOutput(script: string): Promise<string> {
  return runExecutable("osascript", ["-e", script]);
}

function runJxa(script: string): Promise<string> {
  return runExecutable("osascript", ["-l", "JavaScript", "-e", script]);
}

function runAppleScriptKeyCode(keyCode: string, modifier?: string): Promise<void> {
  const modifierPart = modifier ? ` using ${modifier}` : "";
  return runAppleScript(
    `tell application "System Events" to key code ${keyCode}${modifierPart}`,
  );
}

function switchMacSpace(direction: "left" | "right"): Promise<void> {
  const keyCode = direction === "left" ? "123" : "124";

  return runAppleScriptKeyCode(keyCode, "control down");
}

async function openChromeTabOnce(url: string, urlNeedle: string): Promise<void> {
  const script = `
tell application "Google Chrome"
  activate
  set targetUrl to "${escapeAppleScriptString(url)}"
  set targetNeedle to "${escapeAppleScriptString(urlNeedle)}"
  repeat with chromeWindow in windows
    set tabIndex to 1
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab contains targetNeedle) then
        set active tab index of chromeWindow to tabIndex
        set index of chromeWindow to 1
        return
      end if
      set tabIndex to tabIndex + 1
    end repeat
  end repeat
  open location targetUrl
end tell
`;

  try {
    await runAppleScript(script);
  } catch {
    await openMac(url, ["-a", "Google Chrome"]);
  }
}

async function forceRestartMac(): Promise<void> {
  try {
    await runExecutable("/sbin/shutdown", ["-r", "now"]);
    return;
  } catch (error) {
    console.warn(
      "[mac-host] immediate shutdown failed, falling back to loginwindow",
      error,
    );
  }

  try {
    await runAppleScript(
      [
        "ignoring application responses",
        'tell application "loginwindow" to \u00abevent aevtrrst\u00bb',
        "end ignoring",
      ].join("\n"),
    );
    return;
  } catch (error) {
    console.warn(
      "[mac-host] loginwindow restart failed, falling back to System Events",
      error,
    );
  }

  await runAppleScript('tell application "System Events" to restart');
}

async function setMacDisplayBrightness(percent: number): Promise<void> {
  const value = (clampPercent(percent) / 100).toFixed(4);
  const errors: unknown[] = [];
  const bundledHelper = getBundledBrightnessHelper();

  if (bundledHelper) {
    try {
      await runExecutable(bundledHelper, [value]);
      return;
    } catch (error) {
      errors.push(error);
    }
  }

  for (const file of [
    "brightness",
    "/opt/homebrew/bin/brightness",
    "/usr/local/bin/brightness",
  ]) {
    try {
      await runExecutable(file, [value]);
      return;
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    await runJxa(`
      ObjC.import("CoreGraphics");
      ObjC.import("IOKit");

      const service = $.CGDisplayIOServicePort($.CGMainDisplayID());
      const result = $.IODisplaySetFloatParameter(
        service,
        0,
        "brightness",
        ${value},
      );

      if (result !== 0) {
        throw new Error("IODisplaySetFloatParameter failed: " + result);
      }
    `);
    return;
  } catch (error) {
    errors.push(error);
  }

  throw new Error(
    `No direct macOS brightness setter succeeded (${errors.length} attempts)`,
  );
}

function runBundledBrightnessKey(delta: -1 | 1): Promise<string> {
  const bundledHelper = getBundledBrightnessHelper();

  if (!bundledHelper) {
    throw new Error("bundled brightness helper is not available");
  }

  return runExecutable(bundledHelper, [
    "--key",
    delta > 0 ? "up" : "down",
  ]);
}

function getBundledBrightnessHelper(): string | undefined {
  const helper = join(__dirname, "..", "native", "display-brightness");

  return existsSync(helper) ? helper : undefined;
}

function parseBrightnessOutput(output: string): number | undefined {
  const parameterMatch = output.match(/"brightness"\s*=\s*\{([^}]*)\}/s);

  if (parameterMatch) {
    const block = parameterMatch[1];
    const value = parseRegistryNumber(
      block.match(/"?value"?\s*=\s*(\d+)/)?.[1],
    );
    const max = parseRegistryNumber(block.match(/"?max"?\s*=\s*(\d+)/)?.[1]);

    if (value !== undefined && max !== undefined && max > 0) {
      return clampPercent((value / max) * 100);
    }
  }

  const value = parseRegistryNumber(
    output.match(/"brightness"\s*=\s*(\d+)/)?.[1],
  );
  const max = parseRegistryNumber(
    output.match(/"max brightness"\s*=\s*(\d+)/)?.[1],
  );

  if (value !== undefined && max !== undefined && max > 0) {
    return clampPercent((value / max) * 100);
  }

  return undefined;
}

function parseRegistryNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getSteppedBrightnessTarget(
  currentBrightness: number | undefined,
  delta: -1 | 1,
): number | undefined {
  if (currentBrightness === undefined) {
    return undefined;
  }

  const currentStep = Math.max(
    0,
    Math.min(
      BRIGHTNESS_CONTROL_STEPS,
      Math.round((currentBrightness / 100) * BRIGHTNESS_CONTROL_STEPS),
    ),
  );
  const nextStep = Math.max(
    0,
    Math.min(BRIGHTNESS_CONTROL_STEPS, currentStep + delta),
  );

  return Math.round((nextStep / BRIGHTNESS_CONTROL_STEPS) * 100);
}

async function applyBrightnessTarget(
  targetBrightness: number,
  currentBrightness: number | undefined,
  readBrightness: () => Promise<number | undefined>,
): Promise<void> {
  if (
    currentBrightness !== undefined &&
    isBrightnessAtTarget(currentBrightness, targetBrightness)
  ) {
    return;
  }

  const errors: unknown[] = [];

  try {
    await setMacDisplayBrightness(targetBrightness);
    if (await waitForBrightnessTarget(readBrightness, targetBrightness)) {
      return;
    }
  } catch (error) {
    errors.push(error);
  }

  if (currentBrightness !== undefined) {
    await applyBrightnessKeysTowardTarget(
      currentBrightness,
      targetBrightness,
      readBrightness,
    );
    return;
  }

  throw new Error(
    `Unable to set macOS brightness directly (${errors.length} attempts)`,
  );
}

async function applyBrightnessKeysTowardTarget(
  currentBrightness: number,
  targetBrightness: number,
  readBrightness: () => Promise<number | undefined>,
): Promise<void> {
  const delta = targetBrightness > currentBrightness ? 1 : -1;
  const maxSteps = Math.ceil(
    Math.abs(targetBrightness - currentBrightness) /
      (100 / BRIGHTNESS_CONTROL_STEPS),
  ) + 1;

  for (let step = 0; step < maxSteps; step += 1) {
    if (await waitForBrightnessTarget(readBrightness, targetBrightness, 1)) {
      return;
    }

    await applyBrightnessKey(delta, readBrightness);
  }
}

async function applyBrightnessKey(
  delta: -1 | 1,
  readBrightness: () => Promise<number | undefined>,
): Promise<void> {
  try {
    await runBundledBrightnessKey(delta);
    return;
  } catch (error) {
    console.warn("[mac-host] bundled brightness key helper failed", error);
  }

  const keyCode = delta > 0 ? "145" : "144";
  await runAppleScriptKeyCode(keyCode);
  await waitForBrightnessChange(readBrightness);
}

async function waitForBrightnessTarget(
  readBrightness: () => Promise<number | undefined>,
  targetBrightness: number,
  maxPolls = Math.ceil(BRIGHTNESS_CHANGE_TIMEOUT_MS / BRIGHTNESS_POLL_INTERVAL_MS),
): Promise<boolean> {
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const current = await readBrightness();

    if (
      current !== undefined &&
      isBrightnessAtTarget(current, targetBrightness)
    ) {
      return true;
    }

    await delay(BRIGHTNESS_POLL_INTERVAL_MS);
  }

  return false;
}

async function waitForBrightnessChange(
  readBrightness: () => Promise<number | undefined>,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < BRIGHTNESS_CHANGE_TIMEOUT_MS) {
    await readBrightness();
    await delay(BRIGHTNESS_POLL_INTERVAL_MS);
  }
}

function isBrightnessAtTarget(current: number, target: number): boolean {
  return Math.abs(current - target) <= BRIGHTNESS_TARGET_TOLERANCE;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUrlNeedle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
