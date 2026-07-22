import { useCallback, useState } from "react";
import type { RemoteSocket } from "../../../websocket/RemoteSocket";

export function usePlaybackControls(socket: RemoteSocket) {
  const [playbackPaused, setPlaybackPaused] = useState(false);

  const toggleRemotePlayback = useCallback(() => {
    socket.sendTextCommand(getPlaybackToggleCommand(playbackPaused));
    setPlaybackPaused((current) => !current);
  }, [playbackPaused, socket]);

  return {
    playbackPaused,
    toggleRemotePlayback,
  };
}

export function getPlaybackToggleCommand(playbackPaused: boolean) {
  return playbackPaused ? "mediaPlay" : "mediaPause";
}
