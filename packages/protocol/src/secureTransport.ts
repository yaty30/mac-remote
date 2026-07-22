import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ProtocolValidationError } from "./errors";
import type { EncryptedMessage } from "./messages";
import { validateEncryptedEnvelope } from "./validation";
import { ENCRYPTION_VERSION, PROTOCOL_VERSION } from "./version";

const KEY_BYTES = 32;
const NONCE_BYTES = 24;

export type SecureRole = "client" | "server";
export type SecurePlainMessage = Record<string, unknown> & { type: string };

interface SecureSessionOptions {
  clientId: string;
  clientNonce: string;
  role: SecureRole;
  serverNonce: string;
  secretHash: string;
}

export interface DerivedTransportKeys {
  clientToServerKey: Uint8Array;
  serverToClientKey: Uint8Array;
}

export function createSecureNonce(): string {
  return bytesToBase64Url(randomBytes(32));
}

export function deriveTransportKeys({
  clientId,
  clientNonce,
  serverNonce,
  secretHash,
}: Omit<SecureSessionOptions, "role">): DerivedTransportKeys {
  const salt = utf8Bytes(
    [
      "mac-remote-transport-v1",
      `server:${serverNonce}`,
      `client:${clientNonce}`,
      `client-id:${clientId}`,
      `protocol:${PROTOCOL_VERSION}`,
      `encryption:${ENCRYPTION_VERSION}`,
    ].join("|"),
  );

  // HKDF binds the long-lived trusted device secret hash to fresh client/server
  // nonces plus protocol metadata. Separate info labels create independent
  // directional keys so ciphertext in one direction cannot be replayed into the
  // other direction.
  return {
    clientToServerKey: hkdf(
      sha256,
      utf8Bytes(secretHash),
      salt,
      utf8Bytes("client-to-server"),
      KEY_BYTES,
    ),
    serverToClientKey: hkdf(
      sha256,
      utf8Bytes(secretHash),
      salt,
      utf8Bytes("server-to-client"),
      KEY_BYTES,
    ),
  };
}

export class SecureTransportSession {
  private sendSequence = 0;
  private receiveSequence = 0;
  private sendKey: Uint8Array | null;
  private receiveKey: Uint8Array | null;

  constructor(options: SecureSessionOptions) {
    const keys = deriveTransportKeys(options);

    this.sendKey =
      options.role === "client" ? keys.clientToServerKey : keys.serverToClientKey;
    this.receiveKey =
      options.role === "client" ? keys.serverToClientKey : keys.clientToServerKey;
  }

  encrypt(message: SecurePlainMessage): EncryptedMessage {
    if (!this.sendKey) {
      throw new ProtocolValidationError("invalidEncryptedEnvelope", "Session is closed");
    }

    const sequence = this.sendSequence;
    const nonceBytes = randomBytes(NONCE_BYTES);
    const nonce = bytesToBase64Url(nonceBytes);
    const aad = buildAad(sequence, nonce);
    const plaintext = utf8Bytes(JSON.stringify(message));
    const ciphertext = xchacha20poly1305(this.sendKey, nonceBytes, aad).encrypt(
      plaintext,
    );

    this.sendSequence += 1;

    return {
      type: "encrypted",
      protocolVersion: PROTOCOL_VERSION,
      encryptionVersion: ENCRYPTION_VERSION,
      nonce,
      sequence,
      ciphertext: bytesToBase64Url(ciphertext),
    };
  }

  decrypt(envelope: unknown): SecurePlainMessage {
    if (!this.receiveKey) {
      throw new ProtocolValidationError("invalidEncryptedEnvelope", "Session is closed");
    }

    const message = validateEncryptedEnvelope(assertRecord(envelope));

    // WebSocket preserves order, so strict sequencing rejects replayed, stale,
    // and out-of-order ciphertext without a more complex replay window.
    if (message.sequence < this.receiveSequence) {
      throw new ProtocolValidationError("replayDetected", "Replayed message");
    }

    if (message.sequence !== this.receiveSequence) {
      throw new ProtocolValidationError("invalidSequence", "Invalid message sequence");
    }

    const nonceBytes = base64UrlToBytes(message.nonce);

    if (nonceBytes.length !== NONCE_BYTES) {
      throw new ProtocolValidationError("invalidNonce", "Invalid nonce");
    }

    try {
      const plaintext = xchacha20poly1305(
        this.receiveKey,
        nonceBytes,
        buildAad(message.sequence, message.nonce),
      ).decrypt(base64UrlToBytes(message.ciphertext));
      const parsed = JSON.parse(utf8FromBytes(plaintext)) as unknown;

      if (!isRecord(parsed) || typeof parsed.type !== "string") {
        throw new ProtocolValidationError("invalidPayload", "Invalid plaintext");
      }

      this.receiveSequence += 1;
      return parsed as SecurePlainMessage;
    } catch (error) {
      if (error instanceof ProtocolValidationError) {
        throw error;
      }

      throw new ProtocolValidationError("decryptionFailed", "Decryption failed");
    }
  }

  clear(): void {
    this.sendKey?.fill(0);
    this.receiveKey?.fill(0);
    this.sendKey = null;
    this.receiveKey = null;
    this.sendSequence = 0;
    this.receiveSequence = 0;
  }
}

function buildAad(sequence: number, nonce: string): Uint8Array {
  // The envelope metadata is authenticated so attackers cannot rewrite version,
  // nonce, or sequence fields without failing decryption.
  return utf8Bytes(
    JSON.stringify({
      type: "encrypted",
      protocolVersion: PROTOCOL_VERSION,
      encryptionVersion: ENCRYPTION_VERSION,
      nonce,
      sequence,
    }),
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;

    output += chars[(triplet >>> 18) & 0x3f];
    output += chars[(triplet >>> 12) & 0x3f];
    output += index + 1 < bytes.length ? chars[(triplet >>> 6) & 0x3f] : "=";
    output += index + 2 < bytes.length ? chars[triplet & 0x3f] : "=";
  }

  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  if (normalized.length % 4 === 1) {
    throw new ProtocolValidationError(
      "invalidEncryptedEnvelope",
      "Invalid base64url length",
    );
  }

  const output: number[] = [];

  for (let offset = 0; offset < normalized.length; offset += 4) {
    const chunk = normalized.slice(offset, offset + 4);
    const values = [...chunk].map((char) => chars.indexOf(char));

    if (values.some((item) => item < 0)) {
      throw new ProtocolValidationError(
        "invalidEncryptedEnvelope",
        "Invalid base64url character",
      );
    }

    const paddedValues = [...values, 0, 0, 0].slice(0, 4);
    const triplet =
      (paddedValues[0] << 18) |
      (paddedValues[1] << 12) |
      (paddedValues[2] << 6) |
      paddedValues[3];

    output.push((triplet >>> 16) & 0xff);
    if (chunk.length > 2) {
      output.push((triplet >>> 8) & 0xff);
    }
    if (chunk.length > 3) {
      output.push(triplet & 0xff);
    }
  }

  return new Uint8Array(output);
}

function utf8Bytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);

    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < value.length
    ) {
      const next = value.charCodeAt(index + 1);

      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint =
          0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

function utf8FromBytes(bytes: Uint8Array): string {
  let output = "";

  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];

    if (first < 0x80) {
      output += String.fromCharCode(first);
    } else if ((first & 0xe0) === 0xc0) {
      const second = bytes[++index];
      output += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
    } else if ((first & 0xf0) === 0xe0) {
      const second = bytes[++index];
      const third = bytes[++index];
      output += String.fromCharCode(
        ((first & 0x0f) << 12) |
          ((second & 0x3f) << 6) |
          (third & 0x3f),
      );
    } else {
      const second = bytes[++index];
      const third = bytes[++index];
      const fourth = bytes[++index];
      const codePoint =
        ((first & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      const adjusted = codePoint - 0x10000;

      output += String.fromCharCode(
        0xd800 + (adjusted >> 10),
        0xdc00 + (adjusted & 0x3ff),
      );
    }
  }

  return output;
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProtocolValidationError(
      "invalidEncryptedEnvelope",
      "Invalid encrypted envelope",
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
