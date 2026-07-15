import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Key, keyboard } from "@nut-tree-fork/nut-js";
import type { TextCommand } from "../types/protocol";

const MAX_TEXT_CHUNK = 128;
const BRIGHTNESS_CONTROL_STEPS = 16;
const BRIGHTNESS_TARGET_TOLERANCE = Math.ceil(
  100 / BRIGHTNESS_CONTROL_STEPS / 2,
);
const BRIGHTNESS_CHANGE_TIMEOUT_MS = 700;
const BRIGHTNESS_POLL_INTERVAL_MS = 80;

export class KeyboardController {
  private displaySleeping = false;
  private brightnessQueue: Promise<void> = Promise.resolve();

  constructor() {
    keyboard.config.autoDelayMs = 0;
  }

  async typeText(text: string): Promise<void> {
    const safeText = text.slice(0, MAX_TEXT_CHUNK);

    if (safeText.length > 0) {
      await keyboard.type(safeText);
    }
  }

  async pressKey(
    key: "backspace" | "enter" | "escape" | "leftArrow" | "rightArrow",
  ): Promise<void> {
    const keyMap = {
      backspace: Key.Backspace,
      enter: Key.Return,
      escape: Key.Escape,
      leftArrow: Key.Left,
      rightArrow: Key.Right,
    } as const;
    const nutKey = keyMap[key];

    await keyboard.pressKey(nutKey);
    await keyboard.releaseKey(nutKey);
  }

  async textCommand(command: TextCommand): Promise<void> {
    if (command === "clear") {
      await this.textCommand("selectAll");
      await this.pressKey("backspace");
      return;
    }

    if (command === "browserBack" || command === "browserForward") {
      const browserModifier = process.platform === "darwin"
        ? Key.LeftCmd
        : Key.LeftAlt;
      const arrow = command === "browserBack" ? Key.Left : Key.Right;

      await keyboard.pressKey(browserModifier, arrow);
      await keyboard.releaseKey(browserModifier, arrow);
      return;
    }

    if (command === "closeTab") {
      const commandKey = process.platform === "darwin"
        ? Key.LeftCmd
        : Key.LeftControl;

      await keyboard.pressKey(commandKey, Key.W);
      await keyboard.releaseKey(commandKey, Key.W);
      return;
    }

    if (command === "mediaPause" || command === "mediaPlay") {
      await this.setPlayback(command === "mediaPlay" ? "play" : "pause");
      return;
    }

    if (command === "newLine") {
      await keyboard.pressKey(Key.LeftShift, Key.Return);
      await keyboard.releaseKey(Key.LeftShift, Key.Return);
      return;
    }

    const commandKey = process.platform === "darwin"
      ? Key.LeftCmd
      : Key.LeftControl;
    const keyMap = {
      selectAll: Key.A,
      copy: Key.C,
      paste: Key.V,
      reload: Key.R,
    } as const;
    const target = keyMap[command];

    await keyboard.pressKey(commandKey, target);
    await keyboard.releaseKey(commandKey, target);
  }

  async zoom(direction: "in" | "out"): Promise<void> {
    const target = direction === "in" ? Key.Equal : Key.Minus;
    await keyboard.pressKey(Key.LeftCmd, target);
    await keyboard.releaseKey(Key.LeftCmd, target);
  }

  async openMissionControl(): Promise<void> {
    if (process.platform === "darwin") {
      await runAppleScriptKeyCode("126", "control down");
      return;
    }

    console.warn("[keyboard] Mission Control is only implemented for macOS");
  }

  async setPlayback(action: "pause" | "play"): Promise<void> {
    const target = action === "play" ? Key.AudioPlay : Key.AudioPause;

    try {
      await keyboard.pressKey(target);
      await keyboard.releaseKey(target);
      return;
    } catch (error) {
      console.warn(
        `[keyboard] media ${action} key failed, falling back to media play key`,
        error,
      );
    }

    await keyboard.pressKey(Key.AudioPlay);
    await keyboard.releaseKey(Key.AudioPlay);
  }

  async switchSpace(direction: "left" | "right"): Promise<void> {
    if (process.platform === "darwin") {
      try {
        await switchMacSpace(direction);
        return;
      } catch (error) {
        console.warn(
          "[keyboard] osascript space switch failed, falling back to nut.js",
          error,
        );
      }
    }

    const arrow = direction === "left" ? Key.Left : Key.Right;
    await keyboard.pressKey(Key.LeftControl, arrow);
    await keyboard.releaseKey(Key.LeftControl, arrow);
  }

  async adjustBrightness(delta: -1 | 1): Promise<void> {
    if (process.platform !== "darwin") {
      return;
    }

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
    if (process.platform !== "darwin") {
      return;
    }

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

  async setVolume(value: number): Promise<void> {
    const volume = Math.max(0, Math.min(100, Math.round(value)));

    if (process.platform === "darwin") {
      await runAppleScript(`set volume output volume ${volume}`);
      return;
    }

    console.warn("[keyboard] setVolume is only implemented for macOS");
  }

  async getOutputVolume(): Promise<number | undefined> {
    if (process.platform !== "darwin") {
      return undefined;
    }

    const output = await runAppleScriptOutput(
      "output volume of (get volume settings)",
    );
    const volume = Number.parseInt(output.trim(), 10);

    if (!Number.isFinite(volume)) {
      return undefined;
    }

    return Math.max(0, Math.min(100, volume));
  }

  async getDisplayBrightness(): Promise<number | undefined> {
    if (process.platform !== "darwin") {
      return undefined;
    }

    const output = await runExecutable("ioreg", [
      "-r",
      "-c",
      "AppleBacklightDisplay",
      "-d",
      "4",
    ]);

    return parseBrightnessOutput(output);
  }

  async sleep(): Promise<void> {
    if (process.platform === "darwin") {
      if (this.displaySleeping) {
        await runExecutable("caffeinate", ["-u", "-t", "2"]);
        this.displaySleeping = false;
        return;
      }

      await runExecutable("pmset", ["displaysleepnow"]);
      this.displaySleeping = true;
      return;
    }

    console.warn("[keyboard] display sleep/wake is only implemented for macOS");
  }

  async restartHost(): Promise<void> {
    if (process.platform === "darwin") {
      await forceRestartMac();
      return;
    }

    console.warn("[keyboard] host restart is only implemented for macOS");
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
      console.warn("[keyboard] failed to read display brightness", error);
      return undefined;
    }
  }
}

function switchMacSpace(direction: "left" | "right"): Promise<void> {
  const keyCode = direction === "left" ? "123" : "124";

  return runAppleScriptKeyCode(keyCode, "control down");
}

async function forceRestartMac(): Promise<void> {
  try {
    await runExecutable("/sbin/shutdown", ["-r", "now"]);
    return;
  } catch (error) {
    console.warn(
      "[keyboard] immediate shutdown failed, falling back to loginwindow",
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
      "[keyboard] loginwindow restart failed, falling back to System Events",
      error,
    );
  }

  await runAppleScript('tell application "System Events" to restart');
}

function runAppleScriptKeyCode(keyCode: string, modifier?: string): Promise<void> {
  const modifierPart = modifier ? ` using ${modifier}` : "";
  return runAppleScript(
    `tell application "System Events" to key code ${keyCode}${modifierPart}`,
  );
}

async function setMacDisplayBrightness(percent: number): Promise<void> {
  const value = (Math.max(0, Math.min(100, percent)) / 100).toFixed(4);
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

function runAppleScript(script: string): Promise<void> {
  return runAppleScriptOutput(script).then(() => undefined);
}

function runAppleScriptOutput(script: string): Promise<string> {
  return runExecutable("osascript", ["-e", script]);
}

function runJxa(script: string): Promise<string> {
  return runExecutable("osascript", ["-l", "JavaScript", "-e", script]);
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

function runExecutable(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim();

          if (detail) {
            error.message = `${error.message}: ${detail}`;
          }

          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
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

    errors.push(new Error("direct brightness setter did not reach target"));
  } catch (error) {
    errors.push(error);
  }

  if (currentBrightness !== undefined) {
    const delta = targetBrightness > currentBrightness ? 1 : -1;

    try {
      await applyBrightnessKey(delta, readBrightness, currentBrightness);
      return;
    } catch (error) {
      errors.push(error);
    }
  }

  console.warn(
    "[keyboard] brightness change did not take effect",
    summarizeErrors(errors),
  );
}

async function applyBrightnessKey(
  delta: -1 | 1,
  readBrightness: () => Promise<number | undefined>,
  previousBrightness?: number,
): Promise<void> {
  const errors: unknown[] = [];

  try {
    await runBundledBrightnessKey(delta);
    if (await waitForBrightnessChange(readBrightness, previousBrightness)) {
      return;
    }

    errors.push(new Error("native brightness key did not change value"));
  } catch (error) {
    errors.push(error);
  }

  try {
    await runAppleScriptKeyCode(delta > 0 ? "144" : "145");
    if (await waitForBrightnessChange(readBrightness, previousBrightness)) {
      return;
    }

    errors.push(new Error("AppleScript brightness key did not change value"));
  } catch (error) {
    errors.push(error);
  }

  throw new Error(summarizeErrors(errors));
}

async function waitForBrightnessTarget(
  readBrightness: () => Promise<number | undefined>,
  targetBrightness: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < BRIGHTNESS_CHANGE_TIMEOUT_MS) {
    await delay(BRIGHTNESS_POLL_INTERVAL_MS);

    const nextBrightness = await readBrightness();

    if (
      nextBrightness !== undefined &&
      isBrightnessAtTarget(nextBrightness, targetBrightness)
    ) {
      return true;
    }
  }

  return false;
}

async function waitForBrightnessChange(
  readBrightness: () => Promise<number | undefined>,
  previousBrightness?: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < BRIGHTNESS_CHANGE_TIMEOUT_MS) {
    await delay(BRIGHTNESS_POLL_INTERVAL_MS);

    const nextBrightness = await readBrightness();

    if (
      previousBrightness === undefined ||
      nextBrightness === undefined ||
      nextBrightness !== previousBrightness
    ) {
      return true;
    }
  }

  return false;
}

function isBrightnessAtTarget(value: number, target: number): boolean {
  return Math.abs(value - target) <= BRIGHTNESS_TARGET_TOLERANCE;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function summarizeErrors(errors: unknown[]): string {
  return errors
    .map((error) => error instanceof Error ? error.message : String(error))
    .filter((message) => message.length > 0)
    .join("; ");
}
