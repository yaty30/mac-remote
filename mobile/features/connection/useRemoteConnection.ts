import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, type AppStateStatus } from "react-native";
import type { ConnectionStatus, HostPlatform } from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";
import {
  getDeviceId,
  getDeviceNameFromHost,
  parseSavedDevices,
  persistSavedDevices,
  sanitizeHostName,
  upsertDevice,
} from "./deviceUtils";
import {
  DEVICES_STORAGE_KEY,
  HOST_NAME_STORAGE_KEY,
  HOST_STORAGE_KEY,
} from "./storageKeys";
import type { SavedDevice } from "./types";

interface UseRemoteConnectionOptions {
  onResetHostState: () => void;
  onUnmount: () => void;
}

export function useRemoteConnection(
  socket: RemoteSocket,
  { onResetHostState, onUnmount }: UseRemoteConnectionOptions,
) {
  const onResetHostStateRef = useRef(onResetHostState);
  const onUnmountRef = useRef(onUnmount);
  const hostRef = useRef("");
  const statusRef = useRef<ConnectionStatus>("idle");
  const [host, setHost] = useState("");
  const [hostName, setHostName] = useState("");
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

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

    Promise.all([
      AsyncStorage.getItem(HOST_STORAGE_KEY),
      AsyncStorage.getItem(HOST_NAME_STORAGE_KEY),
      AsyncStorage.getItem(DEVICES_STORAGE_KEY),
    ])
      .then(([savedHost, savedHostName, savedDevicesRaw]) => {
        if (cancelled) {
          return;
        }

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

        setSavedDevices(nextDevices);

        if (legacyHost && nextDevices.length !== devices.length) {
          persistSavedDevices(nextDevices);
        }

        if (legacyHost) {
          const device = nextDevices.find((item) => item.host === legacyHost);

          hostRef.current = legacyHost;
          setHost(legacyHost);
          setHostName(device?.name ?? legacyName ?? "");
          socket.connect(legacyHost);
        }
      })
      .catch(() => {
        // Ignore storage errors.
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

      persistSavedDevices(nextDevices);
      return nextDevices;
    });
  }

  function connectToHost(nextHost: string, nextHostName?: string) {
    const cleanHost = nextHost.trim();

    if (cleanHost.length === 0) {
      setStatus("error");
      return;
    }

    Keyboard.dismiss();
    setDeviceDropdownOpen(false);
    hostRef.current = cleanHost;
    setHost(cleanHost);
    onResetHostStateRef.current();
    const matchingDevice = savedDevices.find(
      (device) => device.host === cleanHost,
    );
    const displayName =
      nextHostName ?? matchingDevice?.name ?? getDeviceNameFromHost(cleanHost);

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
    socket.connect(cleanHost);
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
      persistSavedDevices(nextDevices);
      return nextDevices;
    });
  }

  function selectSavedDevice(device: SavedDevice) {
    connectToHost(device.host, device.name);
  }

  function deleteSavedDevice(device: SavedDevice) {
    setSavedDevices((currentDevices) => {
      const nextDevices = currentDevices.filter((item) => item.id !== device.id);
      persistSavedDevices(nextDevices);
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

      persistSavedDevices(nextDevices);
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
    statusRef.current = "error";
    setStatus("error");
  }

  return {
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
