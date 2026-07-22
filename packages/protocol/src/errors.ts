export type ProtocolErrorReason =
  | "invalidJson"
  | "invalidPayload"
  | "unsupportedMessageType"
  | "unsupportedProtocolVersion"
  | "unsupportedEncryptionVersion"
  | "invalidEncryptedEnvelope"
  | "invalidNonce"
  | "invalidSequence"
  | "replayDetected"
  | "decryptionFailed"
  | "plaintextAfterSecureMode"
  | "secureHandshakeTimeout";

export class ProtocolValidationError extends Error {
  constructor(
    public readonly reason: ProtocolErrorReason,
    message: string = reason,
  ) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}
