import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AuthAcceptedMessage,
  AuthRejectedMessage,
  AuthRequestMessage,
  PairedDeviceInfo,
} from "../types/protocol";
import {
  buildTokenProof,
  deriveDeviceToken,
  getTokenId,
} from "./tokenProof";

const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;
const CONSUMED_TOKEN_RETENTION_MS = 30 * 60 * 1000;
const MAX_ACTIVE_PAIRING_TOKENS = 3;
const MAX_CLIENT_ID_LENGTH = 128;
const MAX_CLIENT_NAME_LENGTH = 80;

interface PairingTokenState {
  token: string;
  expiresAt: number;
}

interface ConsumedPairingToken {
  tokenHash: string;
  expiresAt: number;
}

interface StoredPairedDevice {
  clientId: string;
  clientName: string;
  deviceTokenHash: string;
  pairedAt: number;
  lastSeenAt: number;
}

interface StoredAuthState {
  devices: StoredPairedDevice[];
  consumedPairingTokens: ConsumedPairingToken[];
}

type AuthResult =
  | (AuthAcceptedMessage & { transportSecretHash?: string })
  | AuthRejectedMessage;

interface PairingAuthManagerOptions {
  allowLegacyRawTokenAuth?: boolean;
}

export class PairingAuthManager {
  private activePairingTokens: PairingTokenState[] = [];
  private state: StoredAuthState;
  private readonly allowLegacyRawTokenAuth: boolean;

  constructor(
    private readonly storagePath: string,
    options: PairingAuthManagerOptions = {},
  ) {
    this.state = this.readState();
    this.allowLegacyRawTokenAuth = options.allowLegacyRawTokenAuth ?? true;
  }

  getPairingToken(): PairingTokenState {
    const now = Date.now();
    this.purgeExpiredPairingTokens(now);

    const currentToken = this.activePairingTokens.at(-1);

    if (!currentToken) {
      return this.rotatePairingToken();
    }

    return currentToken;
  }

  rotatePairingToken(): PairingTokenState {
    const now = Date.now();
    this.purgeExpiredPairingTokens(now);
    this.activePairingTokens.push({
      token: randomToken(),
      expiresAt: now + PAIRING_TOKEN_TTL_MS,
    });
    this.activePairingTokens = this.activePairingTokens.slice(
      -MAX_ACTIVE_PAIRING_TOKENS,
    );

    return this.activePairingTokens.at(-1) as PairingTokenState;
  }

  listDevices(activeClientIds: ReadonlySet<string>): PairedDeviceInfo[] {
    return this.state.devices
      .map((device) => ({
        clientId: device.clientId,
        clientName: device.clientName,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        connected: activeClientIds.has(device.clientId),
      }))
      .sort(
        (left, right) =>
          Number(right.connected) - Number(left.connected) ||
          right.lastSeenAt - left.lastSeenAt ||
          right.pairedAt - left.pairedAt,
      );
  }

  revokeDevice(clientId: unknown): boolean {
    const normalizedClientId = normalizeClientId(clientId);

    if (!normalizedClientId) {
      return false;
    }

    const previousLength = this.state.devices.length;
    this.state.devices = this.state.devices.filter(
      (device) => device.clientId !== normalizedClientId,
    );

    if (this.state.devices.length === previousLength) {
      return false;
    }

    this.writeState();
    return true;
  }

  authenticate(
    message: AuthRequestMessage,
    challengeNonce?: string,
  ): AuthResult {
    const clientId = normalizeClientId(message.clientId);
    const clientName = normalizeClientName(message.clientName);

    if (!clientId) {
      return { type: "authRejected", reason: "missingCredentials" };
    }

    this.purgeConsumedPairingTokens();
    this.purgeExpiredPairingTokens();

    if (message.deviceTokenProof && challengeNonce) {
      return this.authenticateDeviceTokenProof(
        clientId,
        message.deviceTokenProof,
        challengeNonce,
      );
    }

    if (message.deviceToken && this.allowLegacyRawTokenAuth) {
      return this.authenticateDeviceToken(clientId, message.deviceToken);
    }

    if (
      message.pairingTokenId &&
      message.pairingTokenProof &&
      challengeNonce
    ) {
      return this.authenticatePairingTokenProof(
        clientId,
        clientName,
        message.pairingTokenId,
        message.pairingTokenProof,
        challengeNonce,
      );
    }

    if (message.pairingToken && this.allowLegacyRawTokenAuth) {
      return this.authenticatePairingToken(
        clientId,
        clientName,
        message.pairingToken,
      );
    }

    return { type: "authRejected", reason: "missingCredentials" };
  }

  private authenticateDeviceTokenProof(
    clientId: string,
    deviceTokenProof: string,
    challengeNonce: string,
  ): AuthResult {
    const device = this.state.devices.find((item) => item.clientId === clientId);

    if (
      !device ||
      !safeTextEqual(
        deviceTokenProof,
        buildTokenProof(device.deviceTokenHash, clientId, challengeNonce),
      )
    ) {
      return { type: "authRejected", reason: "deviceNotTrusted" };
    }

    device.lastSeenAt = Date.now();
    this.writeState();

    return withTransportSecret(
      { type: "authAccepted", paired: false },
      device.deviceTokenHash,
    );
  }

  private authenticateDeviceToken(
    clientId: string,
    deviceToken: string,
  ): AuthResult {
    const device = this.state.devices.find((item) => item.clientId === clientId);

    if (!device || !safeHashEqual(device.deviceTokenHash, hashToken(deviceToken))) {
      return { type: "authRejected", reason: "deviceNotTrusted" };
    }

    device.lastSeenAt = Date.now();
    this.writeState();

    return withTransportSecret(
      { type: "authAccepted", paired: false },
      device.deviceTokenHash,
    );
  }

  private authenticatePairingTokenProof(
    clientId: string,
    clientName: string,
    pairingTokenId: string,
    pairingTokenProof: string,
    challengeNonce: string,
  ): AuthResult {
    const normalizedPairingTokenId = normalizeTokenId(pairingTokenId);

    if (
      this.state.consumedPairingTokens.some(
        (item) => getTokenId(item.tokenHash) === normalizedPairingTokenId,
      )
    ) {
      return { type: "authRejected", reason: "pairingTokenUsed" };
    }

    const activeToken = this.findActivePairingTokenById(
      normalizedPairingTokenId,
    );

    if (!activeToken) {
      return {
        type: "authRejected",
        reason:
          this.activePairingTokens.length === 0
            ? "pairingTokenExpired"
            : "pairingTokenInvalid",
      };
    }

    const pairingTokenHash = hashToken(activeToken.token);

    if (
      getTokenId(pairingTokenHash) !== normalizedPairingTokenId ||
      !safeTextEqual(
        pairingTokenProof,
        buildTokenProof(pairingTokenHash, clientId, challengeNonce),
      )
    ) {
      return { type: "authRejected", reason: "pairingTokenInvalid" };
    }

    const now = Date.now();
    const deviceToken = deriveDeviceToken(
      pairingTokenHash,
      clientId,
      challengeNonce,
    );
    const nextDevice: StoredPairedDevice = {
      clientId,
      clientName,
      deviceTokenHash: hashToken(deviceToken),
      pairedAt: now,
      lastSeenAt: now,
    };

    this.state.devices = [
      nextDevice,
      ...this.state.devices.filter((item) => item.clientId !== clientId),
    ].slice(0, 50);
    this.state.consumedPairingTokens.push({
      tokenHash: pairingTokenHash,
      expiresAt: now + CONSUMED_TOKEN_RETENTION_MS,
    });
    this.removeActivePairingToken(activeToken.token);
    this.writeState();

    return withTransportSecret(
      { type: "authAccepted", paired: true },
      nextDevice.deviceTokenHash,
    );
  }

  private authenticatePairingToken(
    clientId: string,
    clientName: string,
    pairingToken: string,
  ): AuthResult {
    const pairingTokenHash = hashToken(pairingToken);

    if (
      this.state.consumedPairingTokens.some((item) =>
        safeHashEqual(item.tokenHash, pairingTokenHash),
      )
    ) {
      return { type: "authRejected", reason: "pairingTokenUsed" };
    }

    const activeToken = this.findActivePairingTokenByHash(pairingTokenHash);

    if (!activeToken) {
      return {
        type: "authRejected",
        reason:
          this.activePairingTokens.length === 0
            ? "pairingTokenExpired"
            : "pairingTokenInvalid",
      };
    }

    const now = Date.now();
    const deviceToken = randomToken();
    const nextDevice: StoredPairedDevice = {
      clientId,
      clientName,
      deviceTokenHash: hashToken(deviceToken),
      pairedAt: now,
      lastSeenAt: now,
    };

    this.state.devices = [
      nextDevice,
      ...this.state.devices.filter((item) => item.clientId !== clientId),
    ].slice(0, 50);
    this.state.consumedPairingTokens.push({
      tokenHash: pairingTokenHash,
      expiresAt: now + CONSUMED_TOKEN_RETENTION_MS,
    });
    this.removeActivePairingToken(activeToken.token);
    this.writeState();

    return withTransportSecret(
      { type: "authAccepted", deviceToken, paired: true },
      nextDevice.deviceTokenHash,
    );
  }

  private purgeConsumedPairingTokens(): void {
    const now = Date.now();
    const nextTokens = this.state.consumedPairingTokens.filter(
      (item) => item.expiresAt > now,
    );

    if (nextTokens.length === this.state.consumedPairingTokens.length) {
      return;
    }

    this.state.consumedPairingTokens = nextTokens;
    this.writeState();
  }

  private purgeExpiredPairingTokens(now = Date.now()): void {
    const nextTokens = this.activePairingTokens
      .filter((item) => item.expiresAt > now)
      .slice(-MAX_ACTIVE_PAIRING_TOKENS);

    this.activePairingTokens = nextTokens;
  }

  private findActivePairingTokenById(
    pairingTokenId: string,
  ): PairingTokenState | null {
    const normalizedPairingTokenId = normalizeTokenId(pairingTokenId);

    if (!normalizedPairingTokenId) {
      return null;
    }

    return (
      this.activePairingTokens.find(
        (item) => getTokenId(hashToken(item.token)) === normalizedPairingTokenId,
      ) ?? null
    );
  }

  private findActivePairingTokenByHash(
    tokenHash: string,
  ): PairingTokenState | null {
    return (
      this.activePairingTokens.find((item) =>
        safeHashEqual(hashToken(item.token), tokenHash),
      ) ?? null
    );
  }

  private removeActivePairingToken(token: string): void {
    this.activePairingTokens = this.activePairingTokens.filter(
      (item) => item.token !== token,
    );
  }

  private readState(): StoredAuthState {
    try {
      if (!existsSync(this.storagePath)) {
        return { devices: [], consumedPairingTokens: [] };
      }

      const parsed = JSON.parse(readFileSync(this.storagePath, "utf8")) as unknown;

      if (!isRecord(parsed)) {
        return { devices: [], consumedPairingTokens: [] };
      }

      return {
        devices: Array.isArray(parsed.devices)
          ? parsed.devices.flatMap(parseStoredDevice)
          : [],
        consumedPairingTokens: Array.isArray(parsed.consumedPairingTokens)
          ? parsed.consumedPairingTokens.flatMap(parseConsumedPairingToken)
          : [],
      };
    } catch {
      return { devices: [], consumedPairingTokens: [] };
    }
  }

  private writeState(): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}

function parseStoredDevice(value: unknown): StoredPairedDevice[] {
  if (!isRecord(value)) {
    return [];
  }

  const clientId = normalizeClientId(value.clientId);
  const clientName = normalizeClientName(value.clientName);
  const deviceTokenHash =
    typeof value.deviceTokenHash === "string" ? value.deviceTokenHash : "";
  const pairedAt = parseTimestamp(value.pairedAt);
  const lastSeenAt = parseTimestamp(value.lastSeenAt);

  if (!clientId || !deviceTokenHash) {
    return [];
  }

  return [
    {
      clientId,
      clientName,
      deviceTokenHash,
      pairedAt,
      lastSeenAt,
    },
  ];
}

function parseConsumedPairingToken(value: unknown): ConsumedPairingToken[] {
  if (!isRecord(value)) {
    return [];
  }

  const tokenHash = typeof value.tokenHash === "string" ? value.tokenHash : "";
  const expiresAt = parseTimestamp(value.expiresAt);

  return tokenHash && expiresAt > Date.now() ? [{ tokenHash, expiresAt }] : [];
}

function withTransportSecret<T extends AuthAcceptedMessage>(
  message: T,
  transportSecretHash: string,
): T & { transportSecretHash: string } {
  Object.defineProperty(message, "transportSecretHash", {
    configurable: true,
    enumerable: false,
    value: transportSecretHash,
  });

  return message as T & { transportSecretHash: string };
}

function normalizeClientId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_CLIENT_ID_LENGTH)
    : "";
}

function normalizeClientName(value: unknown): string {
  const name =
    typeof value === "string" ? value.trim().slice(0, MAX_CLIENT_NAME_LENGTH) : "";

  return name || "Phone";
}

function normalizeTokenId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 32) : "";
}

function parseTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
