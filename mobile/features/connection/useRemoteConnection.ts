import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Platform, type AppStateStatus } from "react-native";
import type {
  AuthRejectedReason,
  ConnectionStatus,
  HostPlatform,
} from "../../types/protocol";
import type { AuthOptions, RemoteSocket } from "../../websocket/RemoteSocket";
import {
  extractLegacyDeviceTokens,
  getDeviceId,
  getDeviceNameFromHost,
  parseSavedDevices,
  persistSavedDevices,
  sanitizeHostName,
  upsertDevice,
} from "./deviceUtils";
import {
  readDeviceToken,
  removeDeviceToken,
  writeDeviceToken,
} from "./deviceCredentials";
import {
  CLIENT_ID_STORAGE_KEY,
  DEVICES_STORAGE_KEY,
  HOST_NAME_STORAGE_KEY,
  HOST_STORAGE_KEY,
} from "./storageKeys";
import type { SavedDevice } from "./types";

interface UseRemoteConnectionOptions {
  onResetHostState: () => void;
  onUnmount: () => void;
}

type ConnectionMode = "active" | "pending";

export function useRemoteConnection(
  socket: RemoteSocket,
  { onResetHostState, onUnmount }: UseRemoteConnectionOptions,
) {
  const onResetHostStateRef = useRef(onResetHostState);
  const onUnmountRef = useRef(onUnmount);
  const clientIdRef = useRef("");
  const hostRef = useRef("");
  const statusRef = useRef<ConnectionStatus>("idle");
  // Mirrors the trusted-device tokens held in SecureStore so the connection
  // flow can read a device's credential synchronously.
  const deviceTokensRef = useRef<Map<string, string>>(new Map());
  // Tokens whose SecureStore write failed. They are kept inline in AsyncStorage
  // as a durable fallback and retried, so a SecureStore failure never destroys
  // an existing credential.
  const pendingTokensRef = useRef<Map<string, string>>(new Map());
  const [host, setHost] = useState("");
  const [hostName, setHostName] = useState("");
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionHydrated, setConnectionHydrated] = useState(false);

  useEffect(() => {
    onResetHostStateRef.current = onResetHostState;
    onUnmountRef.current = onUnmount;
  }, [onResetHostState, onUnmount]);

  useEffect(() => {
    const unsubscribe = socket.onStatus((nextStatus) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);

      if (nextStatus !== "connected") {
        setLatencyMs(null);
      }
    });
    const unsubscribeLatency = socket.onLatency(setLatencyMs);

    return () => {
      onUnmountRef.current();
      unsubscribeLatency();
      unsubscribe();
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    socket.requestHostState();
    const interval = setInterval(() => {
      socket.requestHostState();
    }, 1500);

    return () => clearInterval(interval);
  }, [socket, status]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active" && statusRef.current === "connected") {
          socket.requestHostState();
          return;
        }

        if (
          nextState === "active" &&
          hostRef.current.trim().length > 0 &&
          statusRef.current !== "connected" &&
          statusRef.current !== "connecting"
        ) {
          socket.connect(hostRef.current);
        }
      },
    );

    return () => subscription.remove();
  }, [socket]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateConnection() {
      const [savedClientId, savedHost, savedHostName, savedDevicesRaw] =
        await Promise.all([
          AsyncStorage.getItem(CLIENT_ID_STORAGE_KEY),
          AsyncStorage.getItem(HOST_STORAGE_KEY),
          AsyncStorage.getItem(HOST_NAME_STORAGE_KEY),
          AsyncStorage.getItem(DEVICES_STORAGE_KEY),
        ]);

      if (cancelled) {
        return;
      }

      const clientId = savedClientId?.trim() || createClientId();
      const devices = parseSavedDevices(savedDevicesRaw);
      const legacyHost = savedHost?.trim();
      const legacyName = sanitizeHostName(savedHostName);
      const nextDevices =
        legacyHost && !devices.some((device) => device.host === legacyHost)
          ? upsertDevice(devices, {
              id: getDeviceId(legacyHost),
              name: legacyName ?? getDeviceNameFromHost(legacyHost),
              host: legacyHost,
              platform: undefined,
              lastConnectedAt: Date.now(),
            })
          : devices;

      // Move any tokens stored inline by older builds into SecureStore, then
      // load every known device's credential into the in-memory cache. A token
      // is only dropped from AsyncStorage once SecureStore confirms the write;
      // otherwise it stays inline (pendingTokensRef) and is retried next launch.
      const legacyTokens = extractLegacyDeviceTokens(savedDevicesRaw);
      await Promise.all(
        legacyTokens.map(async ({ id, deviceToken }) => {
          deviceTokensRef.current.set(id, deviceToken);

          const persisted = await writeDeviceToken(id, deviceToken);

          if (!persisted) {
            pendingTokensRef.current.set(id, deviceToken);
          }
        }),
      );
      await Promise.all(
        nextDevices.map(async (device) => {
          if (deviceTokensRef.current.has(device.id)) {
            return;
          }

          const token = await readDeviceToken(device.id);

          if (token) {
            deviceTokensRef.current.set(device.id, token);
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setSavedDevices(nextDevices);
      clientIdRef.current = clientId;

      if (!savedClientId) {
        AsyncStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId).catch(() => {
          // Ignore storage errors.
        });
      }
      if (
        legacyTokens.length > 0 ||
        (legacyHost && nextDevices.length !== devices.length)
      ) {
        saveDeviceMetadata(nextDevices);
      }

      if (legacyHost) {
        const device = nextDevices.find((item) => item.host === legacyHost);

        hostRef.current = legacyHost;
        setHost(legacyHost);
        setHostName(device?.name ?? legacyName ?? "");

        if (!getStoredDeviceToken(legacyHost)) {
          setAuthError(getAuthRejectedMessage("deviceNotTrusted"));
          statusRef.current = "idle";
          setStatus("idle");
          return;
        }

        connectSocket(legacyHost, device?.name ?? legacyName ?? undefined);
      }
    }

    hydrateConnection()
      .catch(() => {
        // Ignore storage errors.
      })
      .finally(() => {
        if (!cancelled) {
          setConnectionHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [socket]);

  useEffect(() => {
    if (status === "connected" && host.trim().length > 0) {
      AsyncStorage.setItem(HOST_STORAGE_KEY, host.trim()).catch(() => {
        // Ignore storage errors.
      });
    }
  }, [status, host]);

  function persistHostName(nextHostName: string, deviceHost = host) {
    setHostName(nextHostName);
    AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, nextHostName).catch(() => {
      // Ignore storage errors.
    });

    if (deviceHost.trim()) {
      persistDevice({
        host: deviceHost,
        name: nextHostName,
      });
    }
  }

  function persistHostPlatform(platform: HostPlatform, deviceHost = host) {
    const cleanHost = deviceHost.trim();

    if (!cleanHost) {
      return;
    }

    setSavedDevices((currentDevices) => {
      const nextDevices = currentDevices.map((device) =>
        device.host === cleanHost ? { ...device, platform } : device,
      );

      saveDeviceMetadata(nextDevices);
      return nextDevices;
    });
  }

  function connectToHost(
    nextHost: string,
    nextHostName?: string,
    pairingToken?: string,
  ) {
    const cleanHost = nextHost.trim();

    if (cleanHost.length === 0) {
      setAuthError(null);
      setStatus("error");
      return;
    }

    Keyboard.dismiss();
    setDeviceDropdownOpen(false);
    setAuthError(null);
    const matchingDevice = savedDevices.find(
      (device) => device.host === cleanHost,
    );
    const displayName =
      nextHostName ?? matchingDevice?.name ?? getDeviceNameFromHost(cleanHost);
    const usePendingConnection =
      statusRef.current === "connected" &&
      hostRef.current.trim().length > 0 &&
      hostRef.current !== cleanHost;

    if (!usePendingConnection) {
      hostRef.current = cleanHost;
      setHost(cleanHost);
      onResetHostStateRef.current();

      if (displayName) {
        setHostName(displayName);
        AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, displayName).catch(() => {
          // Ignore storage errors.
        });
      }
      AsyncStorage.setItem(HOST_STORAGE_KEY, cleanHost).catch(() => {
        // Ignore storage errors.
      });
      persistDevice({
        host: cleanHost,
        name: displayName,
      });
    }

    connectSocket(
      cleanHost,
      displayName,
      pairingToken,
      usePendingConnection ? "pending" : "active",
    );
  }

  function connectSocket(
    cleanHost: string,
    displayName?: string,
    pairingToken?: string,
    mode: ConnectionMode = "active",
  ) {
    const clientId = ensureStoredClientId(clientIdRef);
    const deviceToken = pairingToken ? undefined : getStoredDeviceToken(cleanHost);

    if (!pairingToken && !deviceToken) {
      setAuthError(getAuthRejectedMessage("deviceNotTrusted"));
      if (mode === "active") {
        statusRef.current = "idle";
        setStatus("idle");
      }
      return;
    }

    const auth: AuthOptions = {
      clientId,
      clientName: getClientName(),
      pairingToken,
      deviceToken,
      onAccepted: (nextDeviceToken) => {
        const resolvedToken = nextDeviceToken ?? deviceToken;

        void persistTrustedDevice(cleanHost, displayName, resolvedToken);
      },
      onRejected: (reason) => {
        handleAuthRejected(cleanHost, reason);
      },
      onConnected: () => {
        if (mode !== "pending") {
          return;
        }

        hostRef.current = cleanHost;
        setHost(cleanHost);
        onResetHostStateRef.current();

        if (displayName) {
          setHostName(displayName);
          AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, displayName).catch(() => {
            // Ignore storage errors.
          });
        }
        AsyncStorage.setItem(HOST_STORAGE_KEY, cleanHost).catch(() => {
          // Ignore storage errors.
        });
        socket.requestHostState();
      },
    };

    if (mode === "pending") {
      socket.connectPending(cleanHost, auth);
      return;
    }

    socket.connect(cleanHost, auth);
  }

  function persistDevice(input: { host: string; name?: string }) {
    const cleanHost = input.host.trim();

    if (!cleanHost) {
      return;
    }

    const nextDevice: SavedDevice = {
      id: getDeviceId(cleanHost),
      name: input.name?.trim() || getDeviceNameFromHost(cleanHost),
      host: cleanHost,
      platform: savedDevices.find((device) => device.host === cleanHost)
        ?.platform,
      lastConnectedAt: Date.now(),
    };

    setSavedDevices((currentDevices) => {
      const nextDevices = upsertDevice(currentDevices, nextDevice);
      saveDeviceMetadata(nextDevices);
      return nextDevices;
    });
  }

  function saveDeviceMetadata(devices: SavedDevice[]) {
    persistSavedDevices(devices, pendingTokensRef.current);
  }

  function getStoredDeviceToken(deviceHost: string): string | undefined {
    return deviceTokensRef.current.get(getDeviceId(deviceHost));
  }

  async function persistDeviceToken(
    deviceHost: string,
    token: string,
  ): Promise<boolean> {
    const id = getDeviceId(deviceHost);

    deviceTokensRef.current.set(id, token);

    const persisted = await writeDeviceToken(id, token);

    if (persisted) {
      pendingTokensRef.current.delete(id);
    } else {
      // SecureStore failed; keep the token inline in AsyncStorage so a restart
      // can retry instead of losing the credential.
      pendingTokensRef.current.set(id, token);
    }

    return persisted;
  }

  async function persistTrustedDevice(
    deviceHost: string,
    displayName: string | undefined,
    token: string | undefined,
  ) {
    // Persist the credential before the metadata so a failed SecureStore write
    // is recorded as pending and retained inline by saveDeviceMetadata.
    if (token) {
      await persistDeviceToken(deviceHost, token);
    }

    persistDevice({ host: deviceHost, name: displayName });
  }

  function removeStoredDeviceToken(deviceHost: string) {
    const id = getDeviceId(deviceHost);

    deviceTokensRef.current.delete(id);
    pendingTokensRef.current.delete(id);
    void removeDeviceToken(id);
  }

  function selectSavedDevice(device: SavedDevice) {
    connectToHost(device.host, device.name);
  }

  function handleAuthRejected(hostToUpdate: string, reason: AuthRejectedReason) {
    setAuthError(getAuthRejectedMessage(reason));

    if (reason === "deviceNotTrusted") {
      removeStoredDeviceToken(hostToUpdate);
    }
  }

  function cancelConnection() {
    socket.disconnect();
    statusRef.current = "idle";
    hostRef.current = "";
    setStatus("idle");
    setAuthError(null);
    setLatencyMs(null);
    setHost("");
    setHostName("");
    onResetHostStateRef.current();
    setDeviceDropdownOpen(false);
    AsyncStorage.multiRemove([HOST_STORAGE_KEY, HOST_NAME_STORAGE_KEY]).catch(
      () => {
        // Ignore storage errors.
      },
    );
  }

  function cancelPendingConnection() {
    socket.cancelPendingConnection();
    setAuthError(null);
    setDeviceDropdownOpen(false);
  }

  function deleteSavedDevice(device: SavedDevice) {
    removeStoredDeviceToken(device.host);

    setSavedDevices((currentDevices) => {
      const nextDevices = currentDevices.filter((item) => item.id !== device.id);
      saveDeviceMetadata(nextDevices);
      return nextDevices;
    });

    if (device.host !== hostRef.current) {
      return;
    }

    socket.disconnect();
    statusRef.current = "idle";
    hostRef.current = "";
    setStatus("idle");
    setHost("");
    setHostName("");
    onResetHostStateRef.current();
    setDeviceDropdownOpen(false);
    AsyncStorage.multiRemove([HOST_STORAGE_KEY, HOST_NAME_STORAGE_KEY]).catch(
      () => {
        // Ignore storage errors.
      },
    );
  }

  function renameSavedDevice(device: SavedDevice, nextName: string) {
    const cleanName = nextName.trim().slice(0, 20);

    setSavedDevices((currentDevices) => {
      const nextDevices = currentDevices.map((item) =>
        item.id === device.id ? { ...item, name: cleanName } : item,
      );

      saveDeviceMetadata(nextDevices);
      return nextDevices;
    });

    if (device.host === hostRef.current) {
      setHostName(cleanName);
      AsyncStorage.setItem(HOST_NAME_STORAGE_KEY, cleanName).catch(() => {
        // Ignore storage errors.
      });
    }
  }

  function setConnectionError() {
    setAuthError(null);
    statusRef.current = "error";
    setStatus("error");
  }

  return {
    authError,
    cancelConnection,
    cancelPendingConnection,
    connectionHydrated,
    connectToHost,
    deleteSavedDevice,
    deviceDropdownOpen,
    host,
    hostName,
    persistHostName,
    persistHostPlatform,
    renameSavedDevice,
    savedDevices,
    selectSavedDevice,
    setConnectionError,
    setDeviceDropdownOpen,
    status,
    latencyMs,
  };
}

function ensureStoredClientId(clientIdRef: { current: string }): string {
  if (clientIdRef.current) {
    return clientIdRef.current;
  }

  const clientId = createClientId();
  clientIdRef.current = clientId;
  AsyncStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId).catch(() => {
    // Ignore storage errors.
  });
  return clientId;
}

function createClientId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  return `${Platform.OS}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getClientName(): string {
  if (Platform.OS === "ios") {
    return "iPhone";
  }

  if (Platform.OS === "android") {
    return "Android phone";
  }

  return "Phone";
}

function getAuthRejectedMessage(reason: AuthRejectedReason): string {
  if (reason === "pairingTokenUsed") {
    return "That QR code was already used. Scan the refreshed QR code on the desktop.";
  }

  if (reason === "pairingTokenExpired") {
    return "That QR code expired. Scan the refreshed QR code on the desktop.";
  }

  if (reason === "deviceNotTrusted") {
    return "This phone is not trusted anymore. Scan the desktop QR code again.";
  }

  if (
    reason === "unsupportedEncryptionVersion" ||
    reason === "unsupportedProtocolVersion"
  ) {
    return "The desktop app needs the latest security update before this phone can pair.";
  }

  return "Pairing failed. Scan the desktop QR code again.";
}
