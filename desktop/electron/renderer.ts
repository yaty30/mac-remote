type ConnectionStatus =
  | "starting"
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

type Theme = "light" | "dark";
type WindowAction = "minimize" | "maximize" | "close";
type HealthState = "ready" | "warning" | "error";
type LucideNodeName = "circle" | "path" | "rect";
type LucideNode = readonly [LucideNodeName, Readonly<Record<string, string>>];
type HostPlatform = "darwin" | "win32";

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

interface HostCapabilities {
  brightness: boolean;
  volume: boolean;
  switchWorkspace: boolean;
  switchWindow: boolean;
  showOverview: boolean;
  sleep: boolean;
  restart: boolean;
}

interface PairedDeviceInfo {
  clientId: string;
  clientName: string;
  pairedAt: number;
  lastSeenAt: number;
  connected: boolean;
}

interface DesktopStatus {
  status: ConnectionStatus;
  hostName?: string;
  protocolVersion?: string;
  platform?: HostPlatform;
  capabilities?: HostCapabilities;
  accessibilityTrusted?: boolean;
  accessibilityTargetName?: string;
  accessibilityTargetPath?: string;
  display?: HostDisplayInfo;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairedDevices?: PairedDeviceInfo[];
  latencyMs?: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  pairingTokenExpiresAt?: number;
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
  revokeDevice: (clientId: string) => Promise<boolean>;
  onStatus: (callback: (status: DesktopStatus) => void) => () => void;
}

const THEME_STORAGE_KEY = "mac-remote:desktop-theme";

const statusBadge = query<HTMLDivElement>("#statusBadge");
const statusText = query<HTMLSpanElement>("#statusText");
const deviceName = query<HTMLHeadingElement>("#deviceName");
const clientCount = query<HTMLElement>("#clientCount");
const clientMeta = query<HTMLElement>("#clientMeta");
const networkMeta = query<HTMLElement>("#networkMeta");
const deviceList = query<HTMLDivElement>("#deviceList");
const deviceEmptyState = query<HTMLDivElement>("#deviceEmptyState");
const displayMeta = query<HTMLElement>("#displayMeta");
const addressList = query<HTMLDivElement>("#addressList");
const healthList = query<HTMLDivElement>("#healthList");
const qrImage = query<HTMLImageElement>("#qrImage");
const qrFallback = query<HTMLElement>("#qrFallback");
const pairingUrlText = query<HTMLElement>("#pairingUrlText");
const serverUrl = query<HTMLElement>("#serverUrl");
const expoPanel = query<HTMLDivElement>("#expoPanel");
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
let activeTooltipAnchor: HTMLButtonElement | null = null;
let deviceActionTooltip: HTMLDivElement | null = null;

const LUCIDE_ICON_NODES: Record<string, readonly LucideNode[]> = {
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  minus: [["path", { d: "M5 12h14" }]],
  moon: [["path", { d: "M12 3a6 6 0 0 0 9 7 9 9 0 1 1-9-7" }]],
  "monitor-smartphone": [
    ["path", { d: "M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8" }],
    ["path", { d: "M10 19v-3.96 3.15" }],
    ["path", { d: "M7 19h5" }],
    ["rect", { width: "6", height: "10", x: "16", y: "12", rx: "2" }],
  ],
  smartphone: [
    ["rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2" }],
    ["path", { d: "M12 18h.01" }],
  ],
  square: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }]],
  sun: [
    ["circle", { cx: "12", cy: "12", r: "4" }],
    ["path", { d: "M12 2v2" }],
    ["path", { d: "M12 20v2" }],
    ["path", { d: "m4.93 4.93 1.41 1.41" }],
    ["path", { d: "m17.66 17.66 1.41 1.41" }],
    ["path", { d: "M2 12h2" }],
    ["path", { d: "M20 12h2" }],
    ["path", { d: "m6.34 17.66-1.41 1.41" }],
    ["path", { d: "m19.07 4.93-1.41 1.41" }],
  ],
  wifi: [
    ["path", { d: "M12 20h.01" }],
    ["path", { d: "M2 8.82a15 15 0 0 1 20 0" }],
    ["path", { d: "M5 12.86a10 10 0 0 1 14 0" }],
    ["path", { d: "M8.5 16.43a5 5 0 0 1 7 0" }],
  ],
  "trash-2": [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
    ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
  ],
  unlink: [
    ["path", { d: "m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
    ["path", { d: "m8 8 8 8" }],
    ["path", { d: "m2 2 20 20" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
};

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function hydrateLucideIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-lucide]").forEach((target) => {
    const iconName = target.dataset.lucide;
    const icon = iconName ? createLucideIcon(iconName) : null;

    if (!icon) {
      return;
    }

    target.replaceChildren(icon);
  });
}

function createLucideIcon(name: string): SVGSVGElement | null {
  const nodes = LUCIDE_ICON_NODES[name];

  if (!nodes) {
    console.warn(`[desktop] unknown lucide icon: ${name}`);
    return null;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  nodes.forEach(([nodeName, attrs]) => {
    const child = document.createElementNS("http://www.w3.org/2000/svg", nodeName);
    Object.entries(attrs).forEach(([key, value]) => {
      child.setAttribute(key, value);
    });
    svg.append(child);
  });

  return svg;
}

function renderStatus(status: DesktopStatus): void {
  latestStatus = status;
  applyPlatform(status.platform ?? getRendererPlatform());

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

  deviceName.textContent = status.hostName ?? "Remote Control";
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
  renderExpoPanel(status);
  renderAddresses(status);
  renderHealth(status);
  renderDevices(status);
  updateButtons(status);
}

function renderExpoPanel(status: DesktopStatus): void {
  if (!expoPanel || !expoQrImage || !expoFallback || !expoQrUrl) {
    return;
  }

  const visible = Boolean(status.expoUrl || status.expoQrDataUrl);
  expoPanel.classList.toggle("hidden", !visible);

  if (!visible) {
    expoQrImage.removeAttribute("src");
    expoQrImage.classList.add("hidden");
    return;
  }

  expoQrUrl.textContent = status.errorMessage ?? status.expoUrl ?? "Expo URL unavailable";
  renderQr(expoQrImage, expoFallback, status.expoQrDataUrl, "Expo QR unavailable");
}

function applyPlatform(platform: string | undefined): void {
  if (platform) {
    document.documentElement.dataset.platform = platform;
    return;
  }

  delete document.documentElement.dataset.platform;
}

function getRendererPlatform(): string | undefined {
  const platform = navigator.platform.toLowerCase();

  if (platform.includes("mac")) {
    return "darwin";
  }

  if (platform.includes("win")) {
    return "win32";
  }

  return undefined;
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
      const icon = createLucideIcon("check");
      const text = document.createElement("div");
      const label = document.createElement("strong");
      const detail = document.createElement("span");

      item.className = `healthItem ${check.state}`;
      marker.className = "healthMarker";
      if (icon) {
        marker.append(icon);
      }
      label.textContent = check.label;
      detail.textContent = check.detail;
      text.append(label, detail);
      item.append(marker, text);

      return item;
    }),
  );
}

function renderDevices(status: DesktopStatus): void {
  if (!deviceList || !deviceEmptyState) {
    return;
  }

  hideDeviceActionTooltip();
  const devices = status.pairedDevices ?? [];
  deviceList.replaceChildren(...devices.map((device) => createDeviceRow(device)));
  deviceList.classList.toggle("hidden", devices.length === 0);
  deviceEmptyState.classList.toggle("hidden", devices.length > 0);
}

function createDeviceRow(device: PairedDeviceInfo): HTMLElement {
  const item = document.createElement("article");
  const iconShell = document.createElement("div");
  const icon = createLucideIcon("smartphone");
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  const meta = document.createElement("div");
  const statusDot = document.createElement("span");
  const statusText = document.createElement("span");
  const separator = document.createElement("span");
  const lastActive = document.createElement("span");
  const action = document.createElement("button");
  const actionLabel = device.connected ? "Disconnect device" : "Forget device";
  const actionIcon = createLucideIcon(device.connected ? "unlink" : "trash-2");

  item.className = `deviceRow ${device.connected ? "connected" : ""}`;
  iconShell.className = "deviceRowIcon";
  if (icon) {
    iconShell.append(icon);
  }

  copy.className = "deviceRowCopy";
  name.className = "deviceRowName";
  name.textContent = device.clientName;
  meta.className = "deviceRowMeta";
  statusDot.className = "deviceStatusDot";
  statusText.textContent = device.connected ? "Connected" : "Disconnected";
  separator.className = "deviceMetaSeparator";
  separator.textContent = ".";
  lastActive.textContent = `Last active ${formatRelativeTime(device.lastSeenAt)}`;
  meta.append(statusDot, statusText, separator, lastActive);
  copy.append(name, meta);

  action.className = "deviceAction";
  action.type = "button";
  action.setAttribute("aria-label", actionLabel);
  action.dataset.tooltip = actionLabel;
  if (actionIcon) {
    action.append(actionIcon);
  }
  attachDeviceActionTooltip(action);
  action.addEventListener("click", async () => {
    if (!desktopApi) {
      return;
    }

    hideDeviceActionTooltip();
    action.disabled = true;

    try {
      await desktopApi.revokeDevice(device.clientId);
    } catch (error) {
      action.disabled = false;
      console.error("[desktop] failed to revoke device", error);
    }
  });

  item.append(iconShell, copy, action);
  return item;
}

function attachDeviceActionTooltip(button: HTMLButtonElement): void {
  button.addEventListener("mouseenter", () => showDeviceActionTooltip(button));
  button.addEventListener("focus", () => showDeviceActionTooltip(button));
  button.addEventListener("mouseleave", hideDeviceActionTooltip);
  button.addEventListener("blur", hideDeviceActionTooltip);
}

function showDeviceActionTooltip(button: HTMLButtonElement): void {
  const label = button.dataset.tooltip;

  if (!label || button.disabled) {
    return;
  }

  const tooltip = getDeviceActionTooltip();
  const content = tooltip.querySelector<HTMLSpanElement>(".desktopTooltipLabel");

  if (content) {
    content.textContent = label;
  }

  activeTooltipAnchor = button;
  tooltip.classList.add("visible");
  positionDeviceActionTooltip();
}

function hideDeviceActionTooltip(): void {
  activeTooltipAnchor = null;
  deviceActionTooltip?.classList.remove("visible");
}

function getDeviceActionTooltip(): HTMLDivElement {
  if (deviceActionTooltip) {
    return deviceActionTooltip;
  }

  const tooltip = document.createElement("div");
  const label = document.createElement("span");
  const arrow = document.createElement("span");

  tooltip.className = "desktopTooltip";
  tooltip.setAttribute("role", "tooltip");
  label.className = "desktopTooltipLabel";
  arrow.className = "desktopTooltipArrow";
  tooltip.append(label, arrow);
  document.body.append(tooltip);
  deviceActionTooltip = tooltip;

  return tooltip;
}

function positionDeviceActionTooltip(): void {
  if (!activeTooltipAnchor || !deviceActionTooltip) {
    return;
  }

  const anchorRect = activeTooltipAnchor.getBoundingClientRect();
  const tooltipRect = deviceActionTooltip.getBoundingClientRect();
  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  const left = clamp(
    anchorCenter - tooltipRect.width / 2,
    8,
    window.innerWidth - tooltipRect.width - 8,
  );
  const top = Math.max(8, anchorRect.top - tooltipRect.height - 10);
  const arrowLeft = clamp(anchorCenter - left, 10, tooltipRect.width - 10);

  deviceActionTooltip.style.left = `${left}px`;
  deviceActionTooltip.style.top = `${top}px`;
  deviceActionTooltip.style.setProperty("--tooltip-arrow-left", `${arrowLeft}px`);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
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

function formatRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "unknown";
  }

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedSeconds = Math.round(elapsedMs / 1000);

  if (elapsedSeconds < 45) {
    return "just now";
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);

  if (elapsedDays < 30) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString();
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
    return "Connect this computer and iPhone to the same Wi-Fi.";
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

hydrateLucideIcons();
applyPlatform(getRendererPlatform());
setTheme(resolveInitialTheme());
attachActions();
window.addEventListener("resize", positionDeviceActionTooltip);
window.addEventListener("scroll", positionDeviceActionTooltip, true);

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
