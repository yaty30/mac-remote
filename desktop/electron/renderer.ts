type ConnectionStatus =
  | "starting"
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

type Theme = "light" | "dark";
type WindowAction = "minimize" | "maximize" | "close";
type HealthState = "ready" | "warning" | "error";

interface StartupSettings {
  available: boolean;
  enabled: boolean;
}

interface HostDisplayInfo {
  id: number;
  name: string;
  isTv: boolean;
  brightnessAdjustable: boolean;
  volumeAdjustable: boolean;
}

interface DesktopStatus {
  status: ConnectionStatus;
  hostName?: string;
  protocolVersion?: string;
  platform?: string;
  accessibilityTrusted?: boolean;
  accessibilityTargetName?: string;
  accessibilityTargetPath?: string;
  display?: HostDisplayInfo;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  expoUrl?: string;
  expoQrDataUrl?: string;
  errorMessage?: string;
}

interface RemoteDesktopApi {
  getStatus: () => Promise<DesktopStatus>;
  getStartupSettings: () => Promise<StartupSettings>;
  setStartupEnabled: (enabled: boolean) => Promise<StartupSettings>;
  copyText: (text: string) => Promise<boolean>;
  openAccessibilitySettings: () => Promise<boolean>;
  controlWindow: (action: WindowAction) => Promise<boolean>;
  onStatus: (callback: (status: DesktopStatus) => void) => () => void;
}

const THEME_STORAGE_KEY = "mac-remote:desktop-theme";

const statusBadge = query<HTMLDivElement>("#statusBadge");
const statusText = query<HTMLSpanElement>("#statusText");
const deviceName = query<HTMLHeadingElement>("#deviceName");
const clientCount = query<HTMLElement>("#clientCount");
const clientMeta = query<HTMLElement>("#clientMeta");
const networkMeta = query<HTMLElement>("#networkMeta");
const displayMeta = query<HTMLElement>("#displayMeta");
const addressList = query<HTMLDivElement>("#addressList");
const healthList = query<HTMLDivElement>("#healthList");
const qrImage = query<HTMLImageElement>("#qrImage");
const qrFallback = query<HTMLElement>("#qrFallback");
const pairingUrlText = query<HTMLElement>("#pairingUrlText");
const serverUrl = query<HTMLElement>("#serverUrl");
const expoQrImage = query<HTMLImageElement>("#expoQrImage");
const expoFallback = query<HTMLElement>("#expoFallback");
const expoQrUrl = query<HTMLElement>("#expoQrUrl");
const copyPairingUrl = query<HTMLButtonElement>("#copyPairingUrl");
const copyServerUrl = query<HTMLButtonElement>("#copyServerUrl");
const copyExpoUrl = query<HTMLButtonElement>("#copyExpoUrl");
const openAccessibility = query<HTMLButtonElement>("#openAccessibility");
const accessibilityActionText = query<HTMLElement>("#accessibilityActionText");
const startupToggle = query<HTMLButtonElement>("#startupToggle");
const startupState = query<HTMLElement>("#startupState");
const lightTheme = query<HTMLButtonElement>("#lightTheme");
const darkTheme = query<HTMLButtonElement>("#darkTheme");
const toggleDetails = query<HTMLButtonElement>("#toggleDetails");
const detailsPanel = query<HTMLDivElement>("#detailsPanel");
const minimizeWindow = query<HTMLButtonElement>("#minimizeWindow");
const maximizeWindow = query<HTMLButtonElement>("#maximizeWindow");
const closeWindow = query<HTMLButtonElement>("#closeWindow");
const desktopApi = (
  window as Window & { remoteDesktop?: RemoteDesktopApi }
).remoteDesktop;

let latestStatus: DesktopStatus | null = null;
let startupSettings: StartupSettings = {
  available: false,
  enabled: false,
};

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function renderStatus(status: DesktopStatus): void {
  latestStatus = status;

  if (
    !statusBadge ||
    !statusText ||
    !deviceName ||
    !clientCount ||
    !clientMeta ||
    !networkMeta ||
    !displayMeta ||
    !addressList ||
    !healthList ||
    !qrImage ||
    !qrFallback ||
    !pairingUrlText ||
    !serverUrl ||
    !expoQrImage ||
    !expoFallback ||
    !expoQrUrl ||
    !accessibilityActionText
  ) {
    return;
  }

  const statusLabel = getStatusLabel(status.status);
  const primaryAddress = status.addresses[0] ?? null;
  const displayUrl =
    status.errorMessage ??
    status.pairingUrl ??
    (primaryAddress ? `ws://${primaryAddress}:${status.port}` : `Port ${status.port}`);

  deviceName.textContent = status.hostName ?? "Mac Remote";
  statusText.textContent = statusLabel;
  statusBadge.className = `status ${status.status}`;

  const clientLabel =
    status.connectedClients === 1
      ? "1 phone connected"
      : `${status.connectedClients} phones connected`;
  clientCount.textContent = clientLabel;
  clientMeta.textContent = clientLabel;
  displayMeta.textContent = getDisplayMeta(status.display);
  networkMeta.textContent = getDeviceHint(status);
  pairingUrlText.textContent = displayUrl;
  serverUrl.textContent = displayUrl;
  expoQrUrl.textContent = status.errorMessage ?? status.expoUrl ?? "Expo URL unavailable";
  accessibilityActionText.textContent = getAccessibilityActionText(status);

  if (openAccessibility) {
    openAccessibility.title = status.accessibilityTargetPath
      ? `macOS checks Accessibility permission for ${status.accessibilityTargetPath}`
      : "";
  }

  renderQr(qrImage, qrFallback, status.pairingQrDataUrl, "Pairing QR unavailable");
  renderQr(expoQrImage, expoFallback, status.expoQrDataUrl, "Expo QR unavailable");
  renderAddresses(status);
  renderHealth(status);
  updateButtons(status);
}

function renderQr(
  image: HTMLImageElement,
  fallback: HTMLElement,
  dataUrl: string | undefined,
  emptyText: string,
): void {
  if (dataUrl) {
    image.src = dataUrl;
    image.classList.remove("hidden");
    fallback.classList.add("hidden");
    return;
  }

  image.removeAttribute("src");
  image.classList.add("hidden");
  fallback.textContent = emptyText;
  fallback.classList.remove("hidden");
}

function renderAddresses(status: DesktopStatus): void {
  if (!addressList) {
    return;
  }

  addressList.replaceChildren(
    ...status.addresses.map((address) => {
      const item = document.createElement("button");
      item.className = "address";
      item.type = "button";
      item.textContent = `${address}:${status.port}`;
      item.addEventListener("click", () =>
        copyText(`ws://${address}:${status.port}`, item),
      );
      return item;
    }),
  );

  if (status.addresses.length === 0) {
    const item = document.createElement("div");
    item.className = "address muted";
    item.textContent = "No local Wi-Fi IP found";
    addressList.append(item);
  }
}

function renderHealth(status: DesktopStatus): void {
  if (!healthList) {
    return;
  }

  const checks = [
    {
      label: "Server",
      detail: status.errorMessage ?? getServerDetail(status),
      state: status.status === "error" ? "error" : "ready",
    },
    {
      label: "Local network",
      detail: status.addresses.length > 0 ? "Available" : "No Wi-Fi IP found",
      state: status.addresses.length > 0 ? "ready" : "warning",
    },
    {
      label: "Accessibility",
      detail: getAccessibilityDetail(status),
      state: getAccessibilityState(status),
    },
    {
      label: "Volume control",
      detail: status.display?.volumeAdjustable === false ? "Unavailable" : "Available",
      state: status.display?.volumeAdjustable === false ? "warning" : "ready",
    },
  ] satisfies Array<{
    label: string;
    detail: string;
    state: HealthState;
  }>;

  healthList.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("div");
      const marker = document.createElement("span");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const checkPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      const text = document.createElement("div");
      const label = document.createElement("strong");
      const detail = document.createElement("span");

      item.className = `healthItem ${check.state}`;
      marker.className = "healthMarker";
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      checkPath.setAttribute("d", "M20 6 9 17l-5-5");
      icon.append(checkPath);
      marker.append(icon);
      label.textContent = check.label;
      detail.textContent = check.detail;
      text.append(label, detail);
      item.append(marker, text);

      return item;
    }),
  );
}

function updateButtons(status: DesktopStatus): void {
  setButtonDisabled(copyPairingUrl, !status.pairingUrl);
  setButtonDisabled(copyServerUrl, !status.pairingUrl && status.addresses.length === 0);
  setButtonDisabled(copyExpoUrl, !status.expoUrl);
  setButtonDisabled(
    openAccessibility,
    status.platform !== "darwin" || status.accessibilityTrusted === true,
  );
  renderStartupSettings(startupSettings);
}

function setButtonDisabled(button: HTMLButtonElement | null, disabled: boolean): void {
  if (!button) {
    return;
  }

  button.disabled = disabled;
}

function renderStartupSettings(settings: StartupSettings): void {
  startupSettings = settings;

  if (!startupToggle || !startupState) {
    return;
  }

  startupToggle.disabled = !settings.available;
  startupToggle.classList.toggle("active", settings.enabled);
  startupToggle.setAttribute("aria-checked", settings.enabled ? "true" : "false");
  startupState.textContent = settings.available
    ? settings.enabled
      ? "On"
      : "Off"
    : "Unavailable";
}

function getStatusLabel(status: ConnectionStatus): string {
  const labels: Record<ConnectionStatus, string> = {
    starting: "Starting",
    waiting: "Ready",
    connected: "Connected",
    disconnected: "Disconnected",
    error: "Needs attention",
  };

  return labels[status];
}

function getServerDetail(status: DesktopStatus): string {
  if (status.status === "connected") {
    return "Connected";
  }

  if (status.status === "waiting") {
    return "Ready";
  }

  return getStatusLabel(status.status);
}

function getDisplayMeta(display: HostDisplayInfo | undefined): string {
  if (!display) {
    return "Waiting for display";
  }

  return `Controlling ${display.name}`;
}

function getDeviceHint(status: DesktopStatus): string {
  if (status.connectedClients > 0) {
    return "Connected and ready.";
  }

  if (status.addresses.length === 0) {
    return "Connect this Mac and iPhone to the same Wi-Fi.";
  }

  return "Pair an iPhone to get started.";
}

function getAccessibilityDetail(status: DesktopStatus): string {
  if (status.platform !== "darwin") {
    return "Not required";
  }

  const target = status.accessibilityTargetName
    ? ` for ${status.accessibilityTargetName}`
    : "";

  return status.accessibilityTrusted
    ? `Allowed${target}`
    : `Needs permission${target}`;
}

function getAccessibilityActionText(status: DesktopStatus): string {
  if (status.platform !== "darwin") {
    return "Not required";
  }

  return status.accessibilityTrusted ? "Allowed" : "Needs permission";
}

function getAccessibilityState(status: DesktopStatus): HealthState {
  if (status.platform !== "darwin" || status.accessibilityTrusted) {
    return "ready";
  }

  return "warning";
}

function resolveInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);

  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  lightTheme?.classList.toggle("active", theme === "light");
  darkTheme?.classList.toggle("active", theme === "dark");
}

async function copyText(
  text: string | undefined,
  source: HTMLButtonElement | HTMLElement | null,
): Promise<void> {
  if (!text || !desktopApi) {
    return;
  }

  const ok = await desktopApi.copyText(text);

  if (ok && source instanceof HTMLButtonElement) {
    flashButton(source);
  }
}

function flashButton(button: HTMLButtonElement): void {
  const previous = button.textContent ?? "";
  const canSwapText = button.childElementCount === 0;

  if (canSwapText) {
    button.textContent = "Copied";
  }

  button.classList.add("copied");

  setTimeout(() => {
    if (canSwapText) {
      button.textContent = previous;
    }

    button.classList.remove("copied");
  }, 1100);
}

function attachActions(): void {
  lightTheme?.addEventListener("click", () => setTheme("light"));
  darkTheme?.addEventListener("click", () => setTheme("dark"));

  minimizeWindow?.addEventListener("click", () => {
    desktopApi?.controlWindow("minimize");
  });
  maximizeWindow?.addEventListener("click", () => {
    desktopApi?.controlWindow("maximize");
  });
  closeWindow?.addEventListener("click", () => {
    desktopApi?.controlWindow("close");
  });

  toggleDetails?.addEventListener("click", () => {
    if (!detailsPanel || !toggleDetails) {
      return;
    }

    const isHidden = detailsPanel.classList.toggle("hidden");
    toggleDetails.textContent = isHidden
      ? "Having trouble? Show connection details"
      : "Hide connection details";
  });

  copyPairingUrl?.addEventListener("click", () => {
    copyText(latestStatus?.pairingUrl, copyPairingUrl);
  });

  copyServerUrl?.addEventListener("click", () => {
    const fallback = latestStatus?.addresses[0]
      ? `ws://${latestStatus.addresses[0]}:${latestStatus.port}`
      : undefined;
    copyText(latestStatus?.pairingUrl ?? fallback, copyServerUrl);
  });

  copyExpoUrl?.addEventListener("click", () => {
    copyText(latestStatus?.expoUrl, copyExpoUrl);
  });

  openAccessibility?.addEventListener("click", async () => {
    await desktopApi?.openAccessibilitySettings();

    try {
      const status = await desktopApi?.getStatus();
      if (status) {
        renderStatus(status);
      }
    } catch (error) {
      console.error("[desktop] failed to refresh accessibility status", error);
    }
  });

  startupToggle?.addEventListener("click", async () => {
    if (!desktopApi || !startupSettings.available || startupToggle.disabled) {
      return;
    }

    startupToggle.disabled = true;

    try {
      renderStartupSettings(
        await desktopApi.setStartupEnabled(!startupSettings.enabled),
      );
    } catch (error) {
      console.error("[desktop] failed to update startup setting", error);
      renderStartupSettings(startupSettings);
    }
  });
}

function renderBridgeError(errorMessage: string): void {
  renderStatus({
    status: "error",
    port: 8787,
    addresses: [],
    connectedClients: 0,
    errorMessage,
  });
}

setTheme(resolveInitialTheme());
attachActions();

if (desktopApi) {
  desktopApi.getStatus().then(renderStatus).catch((error) => {
    renderBridgeError(error instanceof Error ? error.message : String(error));
  });
  desktopApi
    .getStartupSettings()
    .then(renderStartupSettings)
    .catch((error) => {
      console.error("[desktop] failed to read startup setting", error);
    });
  desktopApi.onStatus(renderStatus);
} else {
  renderBridgeError("Preload bridge unavailable");
}
