import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");

const keyboardTextModel = await importTypeScriptModule(
  path.join(projectRoot, "features/remote/keyboard/keyboardTextModel.ts"),
  {
    "../../keyboard/constants": "export const TEXT_SEND_CHUNK_SIZE = 128;",
  },
);
const deviceSwitchState = await importTypeScriptModule(
  path.join(projectRoot, "features/remote/hooks/deviceSwitchState.ts"),
);
const playbackControls = await importTypeScriptModule(
  path.join(projectRoot, "features/remote/hooks/usePlaybackControls.ts"),
  {
    react: "export function useCallback(callback) { return callback; }\nexport function useState(initial) { return [initial, () => {}]; }",
  },
);
const deviceUtils = await importTypeScriptModule(
  path.join(projectRoot, "features/connection/deviceUtils.ts"),
  {
    "@react-native-async-storage/async-storage":
      "export default { setItem: async () => {}, getItem: async () => null };",
    "./storageKeys": 'export const DEVICES_STORAGE_KEY = "remote-control:devices";',
  },
);
const deviceCredentials = await importTypeScriptModule(
  path.join(projectRoot, "features/connection/deviceCredentials.ts"),
  {
    "expo-secure-store": [
      'export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "unlocked";',
      "export async function getItemAsync(key) {",
      "  return globalThis.__secureStore?.get(key) ?? null;",
      "}",
      "export async function setItemAsync(key, value) {",
      "  if (globalThis.__secureStoreFailWrite) {",
      '    throw new Error("secure store unavailable");',
      "  }",
      "  (globalThis.__secureStore ??= new Map()).set(key, value);",
      "}",
      "export async function deleteItemAsync(key) {",
      "  globalThis.__secureStore?.delete(key);",
      "}",
    ].join("\n"),
    "../security/tokenProof": 'export function hashToken(token) { return "hash-" + token; }',
  },
);

test("keyboard text is split into text chunks and enter commands", () => {
  assert.deepEqual(
    keyboardTextModel.splitTextIntoRemoteChunks("hello\nworld", 3),
    [
      { type: "text", value: "hel" },
      { type: "text", value: "lo" },
      { type: "enter" },
      { type: "text", value: "wor" },
      { type: "text", value: "ld" },
    ],
  );
});

test("keyboard text diffs preserve the remote cursor sync point", () => {
  assert.deepEqual(keyboardTextModel.diffKeyboardText("abc", "abXc"), {
    deletedCount: 0,
    insertedText: "X",
    syncCursorIndex: 2,
  });
  assert.deepEqual(keyboardTextModel.diffKeyboardText("abc", "ac"), {
    deletedCount: 1,
    insertedText: "",
    syncCursorIndex: 2,
  });
});

test("keyboard selection replacement bounds reversed selections", () => {
  assert.deepEqual(
    keyboardTextModel.replaceKeyboardSelection(
      "remote",
      { start: 5, end: 2 },
      "X",
    ),
    {
      nextCursor: 3,
      nextText: "reXe",
      selectionEnd: 5,
      selectionStart: 2,
    },
  );
});

test("device switch snapshots keep the previous connected device usable", () => {
  assert.deepEqual(
    deviceSwitchState.createDeviceSwitchSnapshot({
      capabilities: { media: true },
      display: { id: 1 },
      getSelectedDevicePlatform: () => "darwin",
      host: "192.168.1.20",
      hostName: "Studio Mac",
      platform: null,
      status: "connected",
    }),
    {
      capabilities: { media: true },
      display: { id: 1 },
      host: "192.168.1.20",
      name: "Studio Mac",
      platform: "darwin",
    },
  );
});

test("device switch snapshots are absent when no previous device is active", () => {
  assert.equal(
    deviceSwitchState.createDeviceSwitchSnapshot({
      capabilities: null,
      display: null,
      getSelectedDevicePlatform: () => undefined,
      host: "",
      hostName: "",
      platform: null,
      status: "idle",
    }),
    null,
  );
});

test("device switching completes only for the pending connected host", () => {
  assert.equal(
    deviceSwitchState.shouldCompleteDeviceSwitch({
      host: "target",
      hostPlatform: "win32",
      status: "connected",
      switchingDeviceHost: "target",
    }),
    true,
  );
  assert.equal(
    deviceSwitchState.shouldCompleteDeviceSwitch({
      host: "previous",
      hostPlatform: "win32",
      status: "connected",
      switchingDeviceHost: "target",
    }),
    false,
  );
});

test("playback toggle chooses the correct remote command", () => {
  assert.equal(playbackControls.getPlaybackToggleCommand(false), "mediaPause");
  assert.equal(playbackControls.getPlaybackToggleCommand(true), "mediaPlay");
});

test("parsed saved devices never expose credential fields", () => {
  const raw = JSON.stringify([
    {
      host: "192.168.1.20:8787",
      name: "Studio Mac",
      platform: "darwin",
      deviceToken: "secret-token",
      lastConnectedAt: 42,
    },
  ]);

  const devices = deviceUtils.parseSavedDevices(raw);

  assert.deepEqual(devices, [
    {
      id: "192.168.1.20:8787",
      name: "Studio Mac",
      host: "192.168.1.20:8787",
      platform: "darwin",
      lastConnectedAt: 42,
    },
  ]);
  assert.equal("deviceToken" in devices[0], false);
});

test("legacy device tokens are extracted for migration", () => {
  const raw = JSON.stringify([
    { host: "Studio-Mac.local", deviceToken: "  legacy-token  " },
    { host: "No-Token.local", name: "No token" },
    { host: "   ", deviceToken: "ignored" },
  ]);

  assert.deepEqual(deviceUtils.extractLegacyDeviceTokens(raw), [
    {
      id: "studio-mac.local",
      host: "Studio-Mac.local",
      deviceToken: "legacy-token",
    },
  ]);
  assert.deepEqual(deviceUtils.extractLegacyDeviceTokens(null), []);
});

test("upserting a device does not reintroduce a credential field", () => {
  const merged = deviceUtils.upsertDevice(
    [
      {
        id: "mac.local",
        name: "Mac",
        host: "mac.local",
        platform: "darwin",
        lastConnectedAt: 1,
      },
    ],
    {
      id: "mac.local",
      name: "Mac",
      host: "mac.local",
      lastConnectedAt: 2,
    },
  );

  assert.equal(merged.length, 1);
  assert.equal("deviceToken" in merged[0], false);
  assert.equal(merged[0].platform, "darwin");
  assert.equal(merged[0].lastConnectedAt, 2);
});

test("writing a device token reports success and persists it", async () => {
  globalThis.__secureStore = new Map();
  globalThis.__secureStoreFailWrite = false;

  const persisted = await deviceCredentials.writeDeviceToken(
    "mac.local",
    "trusted-token",
  );

  assert.equal(persisted, true);
  assert.equal(
    await deviceCredentials.readDeviceToken("mac.local"),
    "trusted-token",
  );
});

test("a failed SecureStore write reports failure instead of resolving ok", async () => {
  globalThis.__secureStore = new Map();
  globalThis.__secureStoreFailWrite = true;

  const persisted = await deviceCredentials.writeDeviceToken(
    "mac.local",
    "trusted-token",
  );

  assert.equal(persisted, false);
  assert.equal(
    await deviceCredentials.readDeviceToken("mac.local"),
    undefined,
  );

  globalThis.__secureStoreFailWrite = false;
});

async function importTypeScriptModule(sourcePath, moduleSources = {}) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "mobile-refactor-test-"));
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const outputPath = path.join(tempDir, "module.mjs");

  Object.entries(moduleSources).forEach(([specifier, moduleSource], index) => {
    const modulePath = path.join(tempDir, `stub-${index}.mjs`);
    writeFileSync(modulePath, moduleSource);
  });

  const patchedSource = Object.keys(moduleSources).reduce(
    (currentSource, specifier, index) =>
      currentSource.replaceAll(
        `from "${specifier}"`,
        `from "${pathToFileURL(path.join(tempDir, `stub-${index}.mjs`)).href}"`,
      ),
    transpiled.outputText,
  );

  writeFileSync(outputPath, patchedSource);

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
