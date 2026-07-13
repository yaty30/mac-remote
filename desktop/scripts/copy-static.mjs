import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(root);
const target = join(root, "dist", "electron");
const assetTarget = join(target, "assets");

mkdirSync(target, { recursive: true });
mkdirSync(assetTarget, { recursive: true });
copyFileSync(join(root, "electron", "index.html"), join(target, "index.html"));
copyFileSync(join(root, "electron", "styles.css"), join(target, "styles.css"));
copyFileSync(
  join(workspaceRoot, "iconset", "playstore.png"),
  join(assetTarget, "alien_app_icon_transparent.png"),
);
