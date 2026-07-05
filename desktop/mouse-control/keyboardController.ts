import { execFile } from "node:child_process";
import { Key, keyboard } from "@nut-tree-fork/nut-js";
import type { TextCommand } from "../types/protocol";

const MAX_TEXT_CHUNK = 128;

export class KeyboardController {
  private displaySleeping = false;

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
    key: "backspace" | "enter" | "leftArrow" | "rightArrow",
  ): Promise<void> {
    const keyMap = {
      backspace: Key.Backspace,
      enter: Key.Return,
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

    await runAppleScriptKeyCode(delta > 0 ? "144" : "145");
    await delay(80);
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
}

function switchMacSpace(direction: "left" | "right"): Promise<void> {
  const keyCode = direction === "left" ? "123" : "124";

  return runAppleScriptKeyCode(keyCode, "control down");
}

function runAppleScriptKeyCode(keyCode: string, modifier?: string): Promise<void> {
  const modifierPart = modifier ? ` using ${modifier}` : "";
  return runAppleScript(
    `tell application "System Events" to key code ${keyCode}${modifierPart}`,
  );
}

function runAppleScript(script: string): Promise<void> {
  return runAppleScriptOutput(script).then(() => undefined);
}

function runAppleScriptOutput(script: string): Promise<string> {
  return runExecutable("osascript", ["-e", script]);
}

function runExecutable(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
