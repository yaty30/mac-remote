import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "dist", "electron");

mkdirSync(target, { recursive: true });
copyFileSync(join(root, "electron", "index.html"), join(target, "index.html"));
copyFileSync(join(root, "electron", "styles.css"), join(target, "styles.css"));
copyFileSync(join(root, "electron", "media.html"), join(target, "media.html"));
copyFileSync(join(root, "electron", "media.css"), join(target, "media.css"));
