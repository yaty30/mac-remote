import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "native", "display-brightness.c");
const outputDir = join(root, "dist", "native");
const output = join(outputDir, "display-brightness");

if (process.platform !== "darwin") {
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

const clang = spawnSync(
  "xcrun",
  [
    "clang",
    "-x",
    "objective-c",
    source,
    "-o",
    output,
    "-framework",
    "CoreGraphics",
    "-framework",
    "IOKit",
    "-framework",
    "AppKit",
  ],
  {
    encoding: "utf8",
  },
);

if (clang.status !== 0) {
  console.warn("[build-native] failed to compile display brightness helper");

  if (clang.stderr.trim()) {
    console.warn(clang.stderr.trim());
  }

  process.exit(0);
}

chmodSync(output, 0o755);
