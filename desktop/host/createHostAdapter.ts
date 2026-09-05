import { KeyboardController } from "../mouse-control/keyboardController";
import { MacHostAdapter } from "./macHostAdapter";
import { WindowsHostAdapter } from "./windowsHostAdapter";
import type { HostAdapter } from "./types";

export function createHostAdapter(
  keyboardController: KeyboardController,
): HostAdapter {
  if (process.platform === "darwin") {
    return new MacHostAdapter(keyboardController);
  }

  if (process.platform === "win32") {
    return new WindowsHostAdapter(keyboardController);
  }

  throw new Error("Only macOS and Windows are supported.");
}
