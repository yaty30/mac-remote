import { ProtocolValidationError } from "./errors";
import type {
  ApplicationHostMessage,
  ApplicationRemoteMessage,
  AuthAcceptedMessage,
  AuthChallengeMessage,
  AuthRejectedReason,
  AuthRequestMessage,
  EncryptedMessage,
  HostCapabilities,
  HostDisplayInfo,
  HostMessage,
  HostPlatform,
  PingMessage,
  PongMessage,
  RemoteMessage,
} from "./messages";
import { ENCRYPTION_VERSION, PROTOCOL_VERSION } from "./version";

const SHORTCUTS = new Set(["netflix", "disney", "amazon", "youtube", "spotify"]);
const TEXT_COMMANDS = new Set([
  "selectAll",
  "copy",
  "paste",
  "newLine",
  "clear",
  "reload",
  "browserBack",
  "browserForward",
  "closeTab",
  "mediaPause",
  "mediaPlay",
]);
const AUTH_REJECTED_REASONS = new Set<AuthRejectedReason>([
  "missingCredentials",
  "pairingTokenExpired",
  "pairingTokenInvalid",
  "pairingTokenUsed",
  "deviceNotTrusted",
  "unsupportedProtocolVersion",
  "unsupportedEncryptionVersion",
]);

export function parseRemoteMessage(raw: string): RemoteMessage {
  return parseMessage(raw, "remote") as RemoteMessage;
}

export function parseHostMessage(raw: string): HostMessage {
  return parseMessage(raw, "host") as HostMessage;
}

export function validateRemoteMessage(value: unknown): RemoteMessage {
  return validateMessage(value, "remote") as RemoteMessage;
}

export function validateHostMessage(value: unknown): HostMessage {
  return validateMessage(value, "host") as HostMessage;
}

export function validateApplicationRemoteMessage(
  value: unknown,
): ApplicationRemoteMessage {
  const message = validateMessage(value, "remote");

  if (message.type === "authRequest" || message.type === "encrypted") {
    throw new ProtocolValidationError("invalidPayload", "Expected application message");
  }

  return message as ApplicationRemoteMessage;
}

export function validateApplicationHostMessage(
  value: unknown,
): ApplicationHostMessage {
  const message = validateMessage(value, "host");

  if (
    message.type === "authChallenge" ||
    message.type === "authAccepted" ||
    message.type === "authRejected" ||
    message.type === "encrypted"
  ) {
    throw new ProtocolValidationError("invalidPayload", "Expected application message");
  }

  return message as ApplicationHostMessage;
}

function parseMessage(raw: string, direction: "remote" | "host") {
  try {
    return validateMessage(JSON.parse(raw) as unknown, direction);
  } catch (error) {
    if (error instanceof ProtocolValidationError) {
      throw error;
    }

    throw new ProtocolValidationError("invalidJson", "Invalid JSON message");
  }
}

function validateMessage(value: unknown, direction: "remote" | "host") {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new ProtocolValidationError("invalidPayload", "Invalid message payload");
  }

  if (value.type === "encrypted") {
    return validateEncryptedEnvelope(value);
  }

  if (value.type === "authRequest" && direction === "remote") {
    return validateAuthRequest(value);
  }

  if (value.type === "authChallenge" && direction === "host") {
    return validateAuthChallenge(value);
  }

  if (value.type === "authAccepted" && direction === "host") {
    return validateAuthAccepted(value);
  }

  if (value.type === "authRejected" && direction === "host") {
    if (!AUTH_REJECTED_REASONS.has(value.reason as AuthRejectedReason)) {
      throw new ProtocolValidationError("invalidPayload", "Invalid authRejected reason");
    }

    return {
      type: "authRejected",
      reason: value.reason,
    };
  }

  return direction === "remote"
    ? validateRemoteApplicationMessage(value)
    : validateHostApplicationMessage(value);
}

function validateAuthRequest(data: Record<string, unknown>): AuthRequestMessage {
  assertSupportedProtocol(data.protocolVersion);
  assertSupportedEncryption(data.encryptionVersion);

  if (typeof data.clientId !== "string" || typeof data.clientName !== "string") {
    throw new ProtocolValidationError("invalidPayload", "Invalid authRequest payload");
  }

  return {
    type: "authRequest",
    protocolVersion: PROTOCOL_VERSION,
    encryptionVersion: ENCRYPTION_VERSION,
    clientId: data.clientId.trim().slice(0, 128),
    clientName: data.clientName.trim().slice(0, 80),
    clientNonce: trimOptionalString(data.clientNonce, 128),
    pairingToken: trimOptionalString(data.pairingToken, 256),
    pairingTokenId: trimOptionalString(data.pairingTokenId, 32),
    pairingTokenProof: trimOptionalString(data.pairingTokenProof, 128),
    deviceToken: trimOptionalString(data.deviceToken, 256),
    deviceTokenProof: trimOptionalString(data.deviceTokenProof, 128),
  };
}

function validateAuthChallenge(
  data: Record<string, unknown>,
): AuthChallengeMessage {
  assertSupportedProtocol(data.protocolVersion);
  assertSupportedEncryption(data.encryptionVersion);

  if (typeof data.nonce !== "string" || data.nonce.length === 0) {
    throw new ProtocolValidationError("invalidPayload", "Invalid authChallenge payload");
  }

  return {
    type: "authChallenge",
    protocolVersion: PROTOCOL_VERSION,
    encryptionVersion: ENCRYPTION_VERSION,
    nonce: data.nonce.trim().slice(0, 128),
    serverNonce: trimOptionalString(data.serverNonce, 128),
  };
}

function validateAuthAccepted(data: Record<string, unknown>): AuthAcceptedMessage {
  assertSupportedProtocol(data.protocolVersion);
  assertSupportedEncryption(data.encryptionVersion);

  return {
    type: "authAccepted",
    protocolVersion: PROTOCOL_VERSION,
    encryptionVersion: ENCRYPTION_VERSION,
    deviceToken: trimOptionalString(data.deviceToken, 256),
    paired: data.paired === true,
  };
}

function validateRemoteApplicationMessage(
  data: Record<string, unknown>,
): ApplicationRemoteMessage {
  if (data.type === "moveMouse") {
    assertNumberFields(data, ["dx", "dy"]);
    return { type: "moveMouse", dx: clampDelta(data.dx), dy: clampDelta(data.dy) };
  }

  if (data.type === "leftClick") return { type: "leftClick" };
  if (data.type === "doubleClick") return { type: "doubleClick" };
  if (data.type === "rightClick") return { type: "rightClick" };

  if (data.type === "scroll") {
    assertNumberFields(data, ["dx", "dy"]);
    return { type: "scroll", dx: clampScroll(data.dx), dy: clampScroll(data.dy) };
  }

  if (data.type === "zoom" && (data.direction === "in" || data.direction === "out")) {
    return { type: "zoom", direction: data.direction };
  }

  if (
    data.type === "swipeSpaces" &&
    (data.direction === "left" || data.direction === "right")
  ) {
    return { type: "swipeSpaces", direction: data.direction };
  }

  if (
    data.type === "switchWorkspace" &&
    (data.direction === "left" || data.direction === "right")
  ) {
    return { type: "switchWorkspace", direction: data.direction };
  }

  if (
    data.type === "switchWindow" &&
    (data.direction === "next" || data.direction === "previous")
  ) {
    return { type: "switchWindow", direction: data.direction };
  }

  if (data.type === "missionControl") return { type: "missionControl" };
  if (data.type === "showOverview") return { type: "showOverview" };
  if (data.type === "requestHostState") return { type: "requestHostState" };

  if (data.type === "adjustBrightness" && (data.delta === -1 || data.delta === 1)) {
    return { type: "adjustBrightness", delta: data.delta };
  }

  if (data.type === "setBrightness") {
    assertNumberFields(data, ["value"]);
    return { type: "setBrightness", value: clampPercent(data.value) };
  }

  if (data.type === "setVolume") {
    assertNumberFields(data, ["value"]);
    return { type: "setVolume", value: clampPercent(data.value) };
  }

  if (data.type === "sleep") return { type: "sleep" };
  if (data.type === "restartHost") return { type: "restartHost" };

  if (data.type === "shortcut" && SHORTCUTS.has(String(data.shortcut))) {
    return { type: "shortcut", shortcut: data.shortcut as never };
  }

  if (data.type === "websiteShortcut") {
    if (typeof data.name !== "string" || typeof data.url !== "string") {
      throw new ProtocolValidationError("invalidPayload", "Invalid websiteShortcut payload");
    }

    const name = data.name.trim().slice(0, 40);
    const url = normalizeWebsiteUrl(data.url);

    if (!name || !url) {
      throw new ProtocolValidationError("invalidPayload", "Invalid websiteShortcut payload");
    }

    return { type: "websiteShortcut", name, url };
  }

  if (data.type === "typeText") {
    if (typeof data.text !== "string") {
      throw new ProtocolValidationError("invalidPayload", "Invalid typeText payload");
    }

    return { type: "typeText", text: data.text.slice(0, 128) };
  }

  if (data.type === "pasteText") {
    if (typeof data.text !== "string") {
      throw new ProtocolValidationError("invalidPayload", "Invalid pasteText payload");
    }

    return { type: "pasteText", text: data.text.slice(0, 10000) };
  }

  if (data.type === "textCommand" && TEXT_COMMANDS.has(String(data.command))) {
    return { type: "textCommand", command: data.command as never };
  }

  if (
    data.type === "moveCaret" &&
    (data.direction === "left" || data.direction === "right") &&
    typeof data.count === "number"
  ) {
    return {
      type: "moveCaret",
      direction: data.direction,
      count: clampCount(data.count),
    };
  }

  if (
    data.type === "pressKey" &&
    (data.key === "backspace" ||
      data.key === "enter" ||
      data.key === "escape" ||
      data.key === "leftArrow" ||
      data.key === "rightArrow")
  ) {
    return { type: "pressKey", key: data.key };
  }

  const pingOrPong = validatePingPong(data);
  if (pingOrPong) return pingOrPong;

  throw new ProtocolValidationError(
    "unsupportedMessageType",
    `Unsupported message type: ${data.type}`,
  );
}

function validateHostApplicationMessage(
  data: Record<string, unknown>,
): ApplicationHostMessage {
  const pingOrPong = validatePingPong(data);
  if (pingOrPong) return pingOrPong;

  if (data.type !== "hostState") {
    throw new ProtocolValidationError(
      "unsupportedMessageType",
      `Unsupported message type: ${data.type}`,
    );
  }

  const platform = validateHostPlatform(data.platform);
  const capabilities = validateCapabilities(data.capabilities);
  const display = validateDisplay(data.display);

  return {
    type: "hostState",
    hostName: trimOptionalString(data.hostName, 80),
    platform,
    capabilities,
    brightness:
      typeof data.brightness === "number" ? clampPercent(data.brightness) : undefined,
    volume: typeof data.volume === "number" ? clampPercent(data.volume) : undefined,
    display,
  };
}

export function validateEncryptedEnvelope(data: Record<string, unknown>): EncryptedMessage {
  assertSupportedProtocol(data.protocolVersion);
  assertSupportedEncryption(data.encryptionVersion);

  if (
    typeof data.nonce !== "string" ||
    !isBase64Url(data.nonce) ||
    typeof data.sequence !== "number" ||
    !Number.isInteger(data.sequence) ||
    data.sequence < 0 ||
    typeof data.ciphertext !== "string" ||
    !isBase64Url(data.ciphertext)
  ) {
    throw new ProtocolValidationError(
      "invalidEncryptedEnvelope",
      "Invalid encrypted envelope",
    );
  }

  return {
    type: "encrypted",
    protocolVersion: PROTOCOL_VERSION,
    encryptionVersion: ENCRYPTION_VERSION,
    nonce: data.nonce,
    sequence: data.sequence,
    ciphertext: data.ciphertext,
  };
}

function validatePingPong(data: Record<string, unknown>): PingMessage | PongMessage | null {
  if (data.type !== "ping" && data.type !== "pong") {
    return null;
  }

  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new ProtocolValidationError("invalidPayload", `Invalid ${data.type} payload`);
  }

  if (data.type === "ping") {
    return { type: "ping", id: data.id.slice(0, 80) };
  }

  return { type: "pong", id: data.id.slice(0, 80) };
}

function validateHostPlatform(value: unknown): HostPlatform {
  if (value === "darwin" || value === "win32") {
    return value;
  }

  throw new ProtocolValidationError("invalidPayload", "Invalid host platform");
}

function validateCapabilities(value: unknown): HostCapabilities {
  if (!isRecord(value)) {
    throw new ProtocolValidationError("invalidPayload", "Invalid host capabilities");
  }

  return {
    brightness: value.brightness === true,
    volume: value.volume === true,
    switchWorkspace: value.switchWorkspace === true,
    switchWindow: value.switchWindow === true,
    showOverview: value.showOverview === true,
    sleep: value.sleep === true,
    restart: value.restart === true,
  };
}

function validateDisplay(value: unknown): HostDisplayInfo | undefined {
  if (!isRecord(value) || typeof value.id !== "number") {
    return undefined;
  }

  return {
    id: Math.round(value.id),
    name: typeof value.name === "string" ? value.name.trim().slice(0, 80) : "",
    isTv: value.isTv === true,
    brightnessAdjustable: value.brightnessAdjustable === true,
    volumeAdjustable: value.volumeAdjustable === true,
  };
}

function assertSupportedProtocol(value: unknown): void {
  // Missing versions are accepted temporarily so already-installed peers can
  // complete the migration handshake before both sides are upgraded.
  if (value === undefined || value === PROTOCOL_VERSION) {
    return;
  }

  throw new ProtocolValidationError(
    "unsupportedProtocolVersion",
    "Unsupported protocol version",
  );
}

function assertSupportedEncryption(value: unknown): void {
  if (value === undefined || value === ENCRYPTION_VERSION) {
    return;
  }

  throw new ProtocolValidationError(
    "unsupportedEncryptionVersion",
    "Unsupported encryption version",
  );
}

function assertNumberFields(
  data: Record<string, unknown>,
  fields: string[],
): asserts data is Record<string, number> {
  for (const field of fields) {
    if (typeof data[field] !== "number") {
      throw new ProtocolValidationError("invalidPayload", "Invalid numeric payload");
    }
  }
}

function trimOptionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function clampDelta(value: number): number {
  return clampFinite(value, -80, 80);
}

function clampScroll(value: number): number {
  return clampFinite(value, -200, 200);
}

function clampCount(value: number): number {
  return Math.round(clampFinite(value, 0, 500));
}

function clampPercent(value: number): number {
  return Math.round(clampFinite(value, 0, 100));
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min === 0 ? 0 : 0;
  }

  return Math.max(min, Math.min(max, value));
}

function normalizeWebsiteUrl(value: string): string | null {
  const cleanValue = value.trim();

  if (cleanValue.length === 0) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(cleanValue)
    ? cleanValue
    : `https://${cleanValue}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
