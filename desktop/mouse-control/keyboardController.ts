import { Key, keyboard } from "@nut-tree-fork/nut-js";
import type { TextCommand } from "../types/protocol";

const MAX_TEXT_CHUNK = 128;
const KEY_SEQUENCE_DELAY_MS = 35;

export class KeyboardController {
  private commandQueue: Promise<void> = Promise.resolve();

  constructor() {
    keyboard.config.autoDelayMs = 0;
  }

  async typeText(text: string): Promise<void> {
    await this.enqueue(async () => {
      const safeText = text.slice(0, MAX_TEXT_CHUNK);

      if (safeText.length > 0) {
        await keyboard.type(safeText);
      }
    });
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

    await this.enqueue(() => this.pressAndReleaseRaw(keyMap[key]));
  }

  async pressAndRelease(...keys: Key[]): Promise<void> {
    await this.enqueue(() => this.pressAndReleaseRaw(...keys));
  }

  async holdAndPress(heldKeys: Key[], tapKey: Key): Promise<void> {
    await this.enqueue(async () => {
      await keyboard.pressKey(...heldKeys);

      try {
        await delay(KEY_SEQUENCE_DELAY_MS);
        await this.pressAndReleaseRaw(tapKey);
        await delay(KEY_SEQUENCE_DELAY_MS);
      } finally {
        await keyboard.releaseKey(...[...heldKeys].reverse());
      }
    });
  }

  async moveCaret(direction: "left" | "right", count: number): Promise<void> {
    const key = direction === "left" ? Key.Left : Key.Right;
    const safeCount = Math.max(0, Math.min(500, Math.round(count)));

    if (safeCount === 0) {
      return;
    }

    await this.enqueue(async () => {
      for (let index = 0; index < safeCount; index += 1) {
        await this.pressAndReleaseRaw(key);
      }
    });
  }

  async textCommand(
    command: TextCommand,
    modifiers: {
      browser: Key;
      command: Key;
    },
  ): Promise<void> {
    await this.enqueue(async () => {
      if (command === "clear") {
        await this.textCommandRaw("selectAll", modifiers);
        await this.pressAndReleaseRaw(Key.Backspace);
        return;
      }

      await this.textCommandRaw(command, modifiers);
    });
  }

  async zoom(direction: "in" | "out", commandKey: Key): Promise<void> {
    await this.enqueue(async () => {
      const target = direction === "in" ? Key.Equal : Key.Minus;

      await this.pressAndReleaseRaw(commandKey, target);
    });
  }

  async setPlayback(action: "pause" | "play"): Promise<void> {
    await this.enqueue(() => this.setPlaybackRaw(action));
  }

  private async textCommandRaw(
    command: TextCommand,
    modifiers: {
      browser: Key;
      command: Key;
    },
  ): Promise<void> {
    if (command === "browserBack" || command === "browserForward") {
      const arrow = command === "browserBack" ? Key.Left : Key.Right;

      await this.pressAndReleaseRaw(modifiers.browser, arrow);
      return;
    }

    if (command === "closeTab") {
      await this.pressAndReleaseRaw(modifiers.command, Key.W);
      return;
    }

    if (command === "mediaPause" || command === "mediaPlay") {
      await this.setPlaybackRaw(command === "mediaPlay" ? "play" : "pause");
      return;
    }

    if (command === "newLine") {
      await this.pressAndReleaseRaw(Key.LeftShift, Key.Return);
      return;
    }

    if (command === "clear") {
      await this.textCommandRaw("selectAll", modifiers);
      await this.pressAndReleaseRaw(Key.Backspace);
      return;
    }

    const keyMap = {
      selectAll: Key.A,
      copy: Key.C,
      paste: Key.V,
      reload: Key.R,
    } as const;

    await this.pressAndReleaseRaw(modifiers.command, keyMap[command]);
  }

  private async pressAndReleaseRaw(...keys: Key[]): Promise<void> {
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
  }

  private async setPlaybackRaw(action: "pause" | "play"): Promise<void> {
    const target = action === "play" ? Key.AudioPlay : Key.AudioPause;

    try {
      await this.pressAndReleaseRaw(target);
      return;
    } catch (error) {
      console.warn(
        `[keyboard] media ${action} key failed, falling back to media play key`,
        error,
      );
    }

    await this.pressAndReleaseRaw(Key.AudioPlay);
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.commandQueue.catch(() => undefined).then(action);
    this.commandQueue = next.catch(() => undefined);

    return next;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
