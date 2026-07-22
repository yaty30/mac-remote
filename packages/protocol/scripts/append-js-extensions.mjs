import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const distRoot = path.resolve(import.meta.dirname, "../dist");

for (const fileName of readdirSync(distRoot)) {
  if (!fileName.endsWith(".js")) {
    continue;
  }

  const filePath = path.join(distRoot, fileName);
  const source = readFileSync(filePath, "utf8");
  const output = source.replaceAll(
    /(from|export\s+\*)\s+"(\.\/[^"]+?)"/g,
    (match, keyword, specifier) =>
      specifier.endsWith(".js") ? match : `${keyword} "${specifier}.js"`,
  );

  writeFileSync(filePath, output, "utf8");
}
