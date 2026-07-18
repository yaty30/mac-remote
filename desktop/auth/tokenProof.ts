import { createHmac } from "node:crypto";

const TOKEN_PROOF_VERSION = "token-proof-v1";

export function getTokenId(tokenHash: string): string {
  return tokenHash.slice(0, 16);
}

export function buildTokenProof(
  tokenHash: string,
  clientId: string,
  nonce: string,
): string {
  return hmacTokenHash(tokenHash, `${TOKEN_PROOF_VERSION}:${clientId}:${nonce}`);
}

export function deriveDeviceToken(
  pairingTokenHash: string,
  clientId: string,
  nonce: string,
): string {
  return hmacTokenHash(
    pairingTokenHash,
    `${TOKEN_PROOF_VERSION}:device-token:${clientId}:${nonce}`,
  );
}

function hmacTokenHash(tokenHash: string, value: string): string {
  return createHmac("sha256", Buffer.from(tokenHash, "hex"))
    .update(value, "utf8")
    .digest("base64url");
}
