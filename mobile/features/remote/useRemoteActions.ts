import { useMemo } from "react";
import type { ShortcutId } from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";
import type { CustomShortcut } from "../shortcuts/types";

export function useRemoteActions(socket: RemoteSocket) {
  return useMemo(
    () => ({
      openShortcut(shortcut: ShortcutId) {
        socket.sendShortcut(shortcut);
      },
      openCustomShortcut(shortcut: CustomShortcut) {
        socket.sendWebsiteShortcut(shortcut.name, shortcut.url);
      },
      showOverview() {
        socket.showOverview();
      },
      switchWindow(direction: "next" | "previous" = "next") {
        socket.switchWindow(direction);
      },
      switchWorkspace(direction: "left" | "right") {
        socket.switchWorkspace(direction);
      },
    }),
    [socket],
  );
}
