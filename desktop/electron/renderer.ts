type ConnectionStatus = "starting" | "waiting" | "connected" | "disconnected" | "error";

interface DesktopStatus {
  status: ConnectionStatus;
  port: number;
  addresses: string[];
  connectedClients: number;
  pairingUrl?: string;
  pairingQrDataUrl?: string;
  errorMessage?: string;
}

interface RemoteDesktopApi {
  getStatus: () => Promise<DesktopStatus>;
  onStatus: (callback: (status: DesktopStatus) => void) => () => void;
}

const statusBadge = document.querySelector<HTMLDivElement>("#statusBadge");
const serverUrl = document.querySelector<HTMLElement>("#serverUrl");
const clientCount = document.querySelector<HTMLElement>("#clientCount");
const addressList = document.querySelector<HTMLDivElement>("#addressList");
const qrImage = document.querySelector<HTMLImageElement>("#qrImage");
const qrUrl = document.querySelector<HTMLElement>("#qrUrl");
const desktopApi = (window as Window & { remoteDesktop?: RemoteDesktopApi }).remoteDesktop;

function renderStatus(status: DesktopStatus): void {
  if (!statusBadge || !serverUrl || !clientCount || !addressList || !qrImage || !qrUrl) {
    return;
  }

  const statusText: Record<DesktopStatus["status"], string> = {
    starting: "Starting",
    waiting: "Waiting",
    connected: "Connected",
    disconnected: "Disconnected",
    error: "Error"
  };

  statusBadge.textContent = statusText[status.status];
  statusBadge.className = `status ${status.status}`;
  clientCount.textContent = String(status.connectedClients);

  const firstAddress = status.addresses[0];
  const displayUrl = status.pairingUrl ?? (firstAddress ? `ws://${firstAddress}:${status.port}` : `Port ${status.port}`);
  serverUrl.textContent = status.errorMessage ?? displayUrl;
  qrUrl.textContent = status.errorMessage ?? displayUrl;

  if (status.pairingQrDataUrl) {
    qrImage.src = status.pairingQrDataUrl;
    qrImage.classList.remove("hidden");
  } else {
    qrImage.removeAttribute("src");
    qrImage.classList.add("hidden");
  }

  addressList.replaceChildren(
    ...status.addresses.map((address) => {
      const item = document.createElement("div");
      item.className = "address";
      item.textContent = `${address}:${status.port}`;
      return item;
    })
  );

  if (status.addresses.length === 0) {
    const item = document.createElement("div");
    item.className = "address muted";
    item.textContent = "No local Wi-Fi IP found";
    addressList.append(item);
  }
}

if (desktopApi) {
  desktopApi.getStatus().then(renderStatus).catch((error) => {
    renderStatus({
      status: "error",
      port: 8787,
      addresses: [],
      connectedClients: 0,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  });
  desktopApi.onStatus(renderStatus);
} else {
  renderStatus({
    status: "error",
    port: 8787,
    addresses: [],
    connectedClients: 0,
    errorMessage: "Preload bridge unavailable"
  });
}
