import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { RemoteWebSocketServer } from "../dist/websocket/server.js";

const localSocketsAvailable = await canListenLocally();

test(
  "server encrypts post-auth traffic and rejects plaintext after secure mode",
  { skip: localSocketsAvailable ? false : "Local socket binding is unavailable" },
  async () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const receivedMessages = [];
  const server = new RemoteWebSocketServer(
    port,
    async (message) => {
      receivedMessages.push(message);
    },
    (message) => addHiddenTransportSecret({
      type: "authAccepted",
      paired: false,
    }, "test-transport-secret"),
    async () => ({
      type: "hostState",
      hostName: "Test Host",
      platform: "darwin",
      capabilities: {
        brightness: true,
        restart: true,
        showOverview: true,
        sleep: true,
        switchWindow: true,
        switchWorkspace: true,
        volume: true,
      },
    }),
  );

  try {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const challenge = await readJson(socket);

    assert.equal(challenge.type, "authChallenge");
    assert.equal(typeof challenge.serverNonce, "string");

    socket.send(JSON.stringify({
      type: "authRequest",
      protocolVersion: 1,
      encryptionVersion: 1,
      clientId: "phone-a",
      clientName: "Phone A",
      clientNonce: "client-nonce-for-test",
      deviceTokenProof: "proof",
    }));

    const accepted = await readJson(socket);
    assert.deepEqual(accepted, {
      type: "authAccepted",
      protocolVersion: 1,
      encryptionVersion: 1,
      paired: false,
    });

    const encryptedHostState = await readJson(socket);
    assert.equal(encryptedHostState.type, "encrypted");
    assert.equal(typeof encryptedHostState.ciphertext, "string");
    assert.equal(receivedMessages.length, 0);

    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ type: "leftClick" }));
    await closed;
  } finally {
    await server.close();
  }
});

function addHiddenTransportSecret(message, transportSecretHash) {
  Object.defineProperty(message, "transportSecretHash", {
    enumerable: false,
    value: transportSecretHash,
  });

  return message;
}

function readJson(socket) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      cleanup();
      resolve(JSON.parse(raw.toString()));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function waitForClose(socket) {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for close"));
    }, 2000);
    const onClose = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("close", onClose);
    };

    socket.on("close", onClose);
  });
}

function canListenLocally() {
  return new Promise((resolve) => {
    const probe = new WebSocketServer({ host: "0.0.0.0", port: 0 });

    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.once("error", () => {
      resolve(false);
    });
  });
}
