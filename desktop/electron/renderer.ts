type ConnectionStatus = "starting" | "waiting" | "connected" | "disconnected" | "error";

interface DesktopStatus {
  status: ConnectionStatus;
  port: number;
  addresses: string[];
  connectedClients: number;
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
const desktopApi = (window as Window & { remoteDesktop?: RemoteDesktopApi }).remoteDesktop;

function renderStatus(status: DesktopStatus): void {
  if (!statusBadge || !serverUrl || !clientCount || !addressList) {
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
  serverUrl.textContent = status.errorMessage ?? (firstAddress ? `ws://${firstAddress}:${status.port}` : `Port ${status.port}`);

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
