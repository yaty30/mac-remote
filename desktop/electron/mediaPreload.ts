import { contextBridge, ipcRenderer } from "electron";

type MediaTabId = "disney" | "netflix" | "youtube";

contextBridge.exposeInMainWorld("mediaBrowser", {
  onSwitchTab: (callback: (tab: MediaTabId) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tab: MediaTabId) => {
      callback(tab);
    };

    ipcRenderer.on("media:switch-tab", listener);

    return () => ipcRenderer.removeListener("media:switch-tab", listener);
  },
});

contextBridge.exposeInMainWorld("mediaWindowControls", {
  minimize: (): Promise<void> => ipcRenderer.invoke("media-window:minimize"),
  toggleMaximize: (): Promise<boolean> =>
    ipcRenderer.invoke("media-window:toggle-maximize"),
  close: (): Promise<void> => ipcRenderer.invoke("media-window:close"),
  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke("media-window:is-maximized"),
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      isMaximized: boolean,
    ) => {
      callback(isMaximized);
    };

    ipcRenderer.on("media-window:maximized", listener);

    return () => ipcRenderer.removeListener("media-window:maximized", listener);
  },
});
