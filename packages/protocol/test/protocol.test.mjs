import assert from "node:assert/strict";
import test from "node:test";
import {
  ENCRYPTION_VERSION,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  SecureTransportSession,
  createSecureNonce,
  deriveTransportKeys,
  parseRemoteMessage,
  validateApplicationRemoteMessage,
  validateHostMessage,
} from "../dist/index.js";

test("valid remote messages parse and clamp numeric values", () => {
  assert.deepEqual(parseRemoteMessage(JSON.stringify({
    type: "moveMouse",
    dx: 999,
    dy: -999,
  })), {
    type: "moveMouse",
    dx: 80,
    dy: -80,
  });
});

test("invalid message types are rejected", () => {
  assert.throws(
    () => parseRemoteMessage(JSON.stringify({ type: "wat" })),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "unsupportedMessageType",
  );
});

test("string lengths are limited and URLs are normalized", () => {
  const message = validateApplicationRemoteMessage({
    type: "websiteShortcut",
    name: "x".repeat(60),
    url: "example.com/app",
  });

  assert.equal(message.type, "websiteShortcut");
  assert.equal(message.name.length, 40);
  assert.equal(message.url, "https://example.com/app");
});

test("unsupported protocol versions are rejected", () => {
  assert.throws(
    () =>
      validateHostMessage({
        type: "authChallenge",
        protocolVersion: PROTOCOL_VERSION + 1,
        encryptionVersion: ENCRYPTION_VERSION,
        nonce: "nonce",
      }),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "unsupportedProtocolVersion",
  );
});

test("client and server derive matching directional keys", () => {
  const inputs = {
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "abc123",
    serverNonce: createSecureNonce(),
  };
  const left = deriveTransportKeys(inputs);
  const right = deriveTransportKeys(inputs);

  assert.deepEqual(left.clientToServerKey, right.clientToServerKey);
  assert.deepEqual(left.serverToClientKey, right.serverToClientKey);
  assert.notDeepEqual(left.clientToServerKey, left.serverToClientKey);
});

test("secure sessions encrypt and decrypt in both directions", () => {
  const inputs = {
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "secret-hash",
    serverNonce: createSecureNonce(),
  };
  const client = new SecureTransportSession({ ...inputs, role: "client" });
  const server = new SecureTransportSession({ ...inputs, role: "server" });
  const encryptedRemote = client.encrypt({ type: "leftClick" });
  const encryptedHost = server.encrypt({ type: "pong", id: "1" });

  assert.deepEqual(server.decrypt(encryptedRemote), { type: "leftClick" });
  assert.deepEqual(client.decrypt(encryptedHost), { type: "pong", id: "1" });
});

test("reconnects derive different session keys", () => {
  const first = deriveTransportKeys({
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "secret-hash",
    serverNonce: createSecureNonce(),
  });
  const second = deriveTransportKeys({
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "secret-hash",
    serverNonce: createSecureNonce(),
  });

  assert.notDeepEqual(first.clientToServerKey, second.clientToServerKey);
});

test("modified ciphertext and metadata are rejected", () => {
  const inputs = {
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "secret-hash",
    serverNonce: createSecureNonce(),
  };
  const client = new SecureTransportSession({ ...inputs, role: "client" });
  const server = new SecureTransportSession({ ...inputs, role: "server" });
  const encrypted = client.encrypt({ type: "leftClick" });

  assert.throws(
    () => server.decrypt({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(1)}A` }),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "decryptionFailed",
  );

  const nextServer = new SecureTransportSession({ ...inputs, role: "server" });
  assert.throws(
    () => nextServer.decrypt({ ...encrypted, sequence: encrypted.sequence + 1 }),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "invalidSequence",
  );
});

test("replayed and out-of-order sequence numbers are rejected", () => {
  const inputs = {
    clientId: "phone",
    clientNonce: createSecureNonce(),
    secretHash: "secret-hash",
    serverNonce: createSecureNonce(),
  };
  const client = new SecureTransportSession({ ...inputs, role: "client" });
  const server = new SecureTransportSession({ ...inputs, role: "server" });
  const first = client.encrypt({ type: "leftClick" });
  const second = client.encrypt({ type: "rightClick" });

  assert.deepEqual(server.decrypt(first), { type: "leftClick" });
  assert.throws(
    () => server.decrypt(first),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "replayDetected",
  );

  const newServer = new SecureTransportSession({ ...inputs, role: "server" });
  assert.throws(
    () => newServer.decrypt(second),
    (error) =>
      error instanceof ProtocolValidationError &&
      error.reason === "invalidSequence",
  );
});
