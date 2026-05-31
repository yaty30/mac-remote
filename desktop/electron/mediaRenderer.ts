type MediaTabId = "disney" | "youtube";

type MediaBrowserApi = {
  onSwitchTab: (callback: (tab: MediaTabId) => void) => () => void;
};

type MediaWindowControlsApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
};

type MediaTab = {
  id: MediaTabId;
  button: HTMLButtonElement;
  view: HTMLElement;
};

const mediaWindow = window as Window & {
  mediaBrowser?: MediaBrowserApi;
  mediaWindowControls?: MediaWindowControlsApi;
};

const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-tab]"),
).map((button): MediaTab => {
  const id = button.dataset.tab as MediaTabId;
  const view = document.querySelector<HTMLElement>(`webview[data-view="${id}"]`);

  if (!view) {
    throw new Error(`Missing media webview for ${id}`);
  }

  return { id, button, view };
});

const statusLabel = document.querySelector<HTMLElement>("#statusLabel");
const maximizeButton = document.querySelector<HTMLButtonElement>(
  "#maximizeButton",
);

function setActiveTab(nextTab: MediaTabId): void {
  for (const tab of tabs) {
    const active = tab.id === nextTab;

    tab.button.classList.toggle("active", active);
    tab.button.setAttribute("aria-selected", active ? "true" : "false");
    tab.view.classList.toggle("active", active);
  }

  const activeTab = tabs.find((tab) => tab.id === nextTab);
  statusLabel?.replaceChildren(
    document.createTextNode(activeTab?.button.textContent?.trim() ?? ""),
  );
}

function updateMaximizedState(isMaximized: boolean): void {
  document.body.classList.toggle("maximized", isMaximized);

  if (maximizeButton) {
    maximizeButton.setAttribute(
      "aria-label",
      isMaximized ? "Restore" : "Expand",
    );
  }
}

for (const tab of tabs) {
  tab.button.addEventListener("click", () => setActiveTab(tab.id));

  tab.view.addEventListener("did-start-loading", () => {
    if (tab.button.classList.contains("active")) {
      statusLabel?.replaceChildren(document.createTextNode("Loading..."));
    }
  });

  tab.view.addEventListener("did-stop-loading", () => {
    if (tab.button.classList.contains("active")) {
      statusLabel?.replaceChildren(
        document.createTextNode(tab.button.textContent?.trim() ?? ""),
      );
    }
  });

  tab.view.addEventListener("did-fail-load", () => {
    if (tab.button.classList.contains("active")) {
      statusLabel?.replaceChildren(document.createTextNode("Load failed"));
    }
  });
}

document
  .querySelector<HTMLButtonElement>('[data-window-action="minimize"]')
  ?.addEventListener("click", () => {
    mediaWindow.mediaWindowControls?.minimize();
  });

maximizeButton?.addEventListener("click", () => {
  mediaWindow.mediaWindowControls
    ?.toggleMaximize()
    .then(updateMaximizedState)
    .catch(() => {
      // Window controls are best-effort UI affordances.
    });
});

document
  .querySelector<HTMLButtonElement>('[data-window-action="close"]')
  ?.addEventListener("click", () => {
    mediaWindow.mediaWindowControls?.close();
  });

mediaWindow.mediaWindowControls?.isMaximized().then(updateMaximizedState);
mediaWindow.mediaWindowControls?.onMaximizedChange(updateMaximizedState);
mediaWindow.mediaBrowser?.onSwitchTab(setActiveTab);
setActiveTab("youtube");
