import { contextBridge, ipcRenderer } from "electron";
import type { DesktopStatus } from "../types/protocol";

contextBridge.exposeInMainWorld("remoteDesktop", {
  getStatus: (): Promise<DesktopStatus> => ipcRenderer.invoke("status:get"),
  getStartupSettings: (): Promise<{ available: boolean; enabled: boolean }> =>
    ipcRenderer.invoke("startup:get"),
  setStartupEnabled: (
    enabled: boolean,
  ): Promise<{ available: boolean; enabled: boolean }> =>
    ipcRenderer.invoke("startup:set", enabled),
  copyText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke("clipboard:write", text),
  openAccessibilitySettings: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:accessibility"),
  controlWindow: (action: "minimize" | "maximize" | "close"): Promise<boolean> =>
    ipcRenderer.invoke("window:control", action),
  onStatus: (callback: (status: DesktopStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: DesktopStatus) =>
      callback(status);
    ipcRenderer.on("status:update", listener);

    return () => ipcRenderer.removeListener("status:update", listener);
  }
});
