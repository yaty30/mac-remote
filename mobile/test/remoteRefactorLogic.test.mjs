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
