import { Key, keyboard } from "@nut-tree-fork/nut-js";
import type { TextCommand } from "../types/protocol";

const MAX_TEXT_CHUNK = 128;

export class KeyboardController {
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

    await this.pressAndRelease(keyMap[key]);
  }

  async pressAndRelease(...keys: Key[]): Promise<void> {
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
  }

  async textCommand(
    command: TextCommand,
    modifiers: {
      browser: Key;
      command: Key;
    },
  ): Promise<void> {
    if (command === "clear") {
      await this.textCommand("selectAll", modifiers);
      await this.pressKey("backspace");
      return;
    }

    if (command === "browserBack" || command === "browserForward") {
      const arrow = command === "browserBack" ? Key.Left : Key.Right;

      await this.pressAndRelease(modifiers.browser, arrow);
      return;
    }

    if (command === "closeTab") {
      await this.pressAndRelease(modifiers.command, Key.W);
      return;
    }

    if (command === "mediaPause" || command === "mediaPlay") {
      await this.setPlayback(command === "mediaPlay" ? "play" : "pause");
      return;
    }

    if (command === "newLine") {
      await this.pressAndRelease(Key.LeftShift, Key.Return);
      return;
    }

    const keyMap = {
      selectAll: Key.A,
      copy: Key.C,
      paste: Key.V,
      reload: Key.R,
    } as const;

    await this.pressAndRelease(modifiers.command, keyMap[command]);
  }

  async zoom(direction: "in" | "out", commandKey: Key): Promise<void> {
    const target = direction === "in" ? Key.Equal : Key.Minus;

    await this.pressAndRelease(commandKey, target);
  }

  async setPlayback(action: "pause" | "play"): Promise<void> {
    const target = action === "play" ? Key.AudioPlay : Key.AudioPause;

    try {
      await this.pressAndRelease(target);
      return;
    } catch (error) {
      console.warn(
        `[keyboard] media ${action} key failed, falling back to media play key`,
        error,
      );
    }

    await this.pressAndRelease(Key.AudioPlay);
  }
}
