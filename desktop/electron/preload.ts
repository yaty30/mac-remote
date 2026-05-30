import { contextBridge, ipcRenderer } from "electron";
import type { DesktopStatus } from "../types/protocol";

contextBridge.exposeInMainWorld("remoteDesktop", {
  getStatus: (): Promise<DesktopStatus> => ipcRenderer.invoke("status:get"),
  onStatus: (callback: (status: DesktopStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: DesktopStatus) => callback(status);
    ipcRenderer.on("status:update", listener);

    return () => ipcRenderer.removeListener("status:update", listener);
  }
});
