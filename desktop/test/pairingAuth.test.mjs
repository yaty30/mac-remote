import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pairingAuthModule from "../dist/auth/pairingAuth.js";
import tokenProofModule from "../dist/auth/tokenProof.js";

const { PairingAuthManager } = pairingAuthModule;
const { buildTokenProof, deriveDeviceToken, getTokenId } = tokenProofModule;

test("pairing token can be used once and rejects replay from another phone", () => {
  withManager((manager) => {
    const pairingToken = manager.getPairingToken().token;
    const phoneA = manager.authenticate({
      type: "authRequest",
      clientId: "phone-a",
      clientName: "Phone A",
      pairingToken,
    });

    assert.equal(phoneA.type, "authAccepted");
    assert.equal(phoneA.paired, true);
    assert.equal(typeof phoneA.deviceToken, "string");

    const phoneB = manager.authenticate({
      type: "authRequest",
      clientId: "phone-b",
      clientName: "Phone B",
      pairingToken,
    });

    assert.deepEqual(phoneB, {
      type: "authRejected",
      reason: "pairingTokenUsed",
    });
  });
});

test("stored device token reconnects after auth manager reload", () => {
  withStorage((storagePath) => {
    const firstManager = new PairingAuthManager(storagePath);
    const pairingToken = firstManager.getPairingToken().token;
    const firstAuth = firstManager.authenticate({
      type: "authRequest",
      clientId: "phone-a",
      clientName: "Phone A",
      pairingToken,
    });

    assert.equal(firstAuth.type, "authAccepted");
    assert.equal(typeof firstAuth.deviceToken, "string");

    const secondManager = new PairingAuthManager(storagePath);
    const reconnect = secondManager.authenticate({
      type: "authRequest",
      clientId: "phone-a",
      clientName: "Phone A",
      deviceToken: firstAuth.deviceToken,
    });

    assert.deepEqual(reconnect, {
      type: "authAccepted",
      paired: false,
    });
  });
});

test("proof-based pairing does not return the derived device token over the socket", () => {
  withManager((manager) => {
    const clientId = "phone-a";
    const challengeNonce = "desktop-challenge";
    const pairingToken = manager.getPairingToken().token;
    const pairingTokenHash = sha256Hex(pairingToken);
    const auth = manager.authenticate(
      {
        type: "authRequest",
        clientId,
        clientName: "Phone A",
        pairingTokenId: getTokenId(pairingTokenHash),
        pairingTokenProof: buildTokenProof(
          pairingTokenHash,
          clientId,
          challengeNonce,
        ),
      },
      challengeNonce,
    );

    assert.deepEqual(auth, {
      type: "authAccepted",
      paired: true,
    });

    const deviceToken = deriveDeviceToken(
      pairingTokenHash,
      clientId,
      challengeNonce,
    );
    const reconnectNonce = "desktop-reconnect-challenge";
    const reconnect = manager.authenticate(
      {
        type: "authRequest",
        clientId,
        clientName: "Phone A",
        deviceTokenProof: buildTokenProof(
          sha256Hex(deviceToken),
          clientId,
          reconnectNonce,
        ),
      },
      reconnectNonce,
    );

    assert.deepEqual(reconnect, {
      type: "authAccepted",
      paired: false,
    });
  });
});

test("proof-based pairing token replay is rejected by token id", () => {
  withManager((manager) => {
    const pairingToken = manager.getPairingToken().token;
    const pairingTokenHash = sha256Hex(pairingToken);
    const tokenId = getTokenId(pairingTokenHash);
    const nonceA = "nonce-a";

    const accepted = manager.authenticate(
      {
        type: "authRequest",
        clientId: "phone-a",
        clientName: "Phone A",
        pairingTokenId: tokenId,
        pairingTokenProof: buildTokenProof(pairingTokenHash, "phone-a", nonceA),
      },
      nonceA,
    );

    assert.equal(accepted.type, "authAccepted");

    const nonceB = "nonce-b";
    const replay = manager.authenticate(
      {
        type: "authRequest",
        clientId: "phone-b",
        clientName: "Phone B",
        pairingTokenId: tokenId,
        pairingTokenProof: buildTokenProof(pairingTokenHash, "phone-b", nonceB),
      },
      nonceB,
    );

    assert.deepEqual(replay, {
      type: "authRejected",
      reason: "pairingTokenUsed",
    });
  });
});

test("legacy raw token auth can be disabled for production mode", () => {
  withStorage((storagePath) => {
    const devManager = new PairingAuthManager(storagePath);
    const clientId = "phone-a";
    const pairingToken = devManager.getPairingToken().token;
    const auth = devManager.authenticate({
      type: "authRequest",
      clientId,
      clientName: "Phone A",
      pairingToken,
    });

    assert.equal(auth.type, "authAccepted");

    const productionManager = new PairingAuthManager(storagePath, {
      allowLegacyRawTokenAuth: false,
    });
    const rawReconnect = productionManager.authenticate({
      type: "authRequest",
      clientId,
      clientName: "Phone A",
      deviceToken: auth.deviceToken,
    });

    assert.deepEqual(rawReconnect, {
      type: "authRejected",
      reason: "missingCredentials",
    });

    const nonce = "production-nonce";
    const proofReconnect = productionManager.authenticate(
      {
        type: "authRequest",
        clientId,
        clientName: "Phone A",
        deviceTokenProof: buildTokenProof(
          sha256Hex(auth.deviceToken),
          clientId,
          nonce,
        ),
      },
      nonce,
    );

    assert.deepEqual(proofReconnect, {
      type: "authAccepted",
      paired: false,
    });
  });
});

test("revoke removes device trust and blocks future device-token auth", () => {
  withManager((manager) => {
    const pairingToken = manager.getPairingToken().token;
    const auth = manager.authenticate({
      type: "authRequest",
      clientId: "phone-a",
      clientName: "Phone A",
      pairingToken,
    });

    assert.equal(auth.type, "authAccepted");
    assert.equal(manager.revokeDevice("phone-a"), true);
    assert.equal(manager.revokeDevice("phone-a"), false);
    assert.deepEqual(manager.listDevices(new Set()), []);

    const reconnect = manager.authenticate({
      type: "authRequest",
      clientId: "phone-a",
      clientName: "Phone A",
      deviceToken: auth.deviceToken,
    });

    assert.deepEqual(reconnect, {
      type: "authRejected",
      reason: "deviceNotTrusted",
    });
  });
});

test("device list sorts connected devices first then recent activity", () => {
  withManager((manager) => {
    const phoneA = pairDevice(manager, "phone-a", "Phone A");
    const phoneB = pairDevice(manager, "phone-b", "Phone B");

    assert.equal(phoneA.type, "authAccepted");
    assert.equal(phoneB.type, "authAccepted");

    const devices = manager.listDevices(new Set(["phone-a"]));

    assert.equal(devices.length, 2);
    assert.equal(devices[0].clientId, "phone-a");
    assert.equal(devices[0].connected, true);
    assert.equal(devices[1].clientId, "phone-b");
    assert.equal(devices[1].connected, false);
  });
});

function pairDevice(manager, clientId, clientName) {
  const pairingToken = manager.getPairingToken().token;

  return manager.authenticate({
    type: "authRequest",
    clientId,
    clientName,
    pairingToken,
  });
}

function withManager(callback) {
  withStorage((storagePath) => {
    callback(new PairingAuthManager(storagePath));
  });
}

function withStorage(callback) {
  const directory = mkdtempSync(path.join(tmpdir(), "remote-control-auth-"));

  try {
    callback(path.join(directory, "paired-devices.json"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sha256Hex(value) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}
