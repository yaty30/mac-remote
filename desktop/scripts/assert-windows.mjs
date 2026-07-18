if (process.platform !== "win32") {
  console.error(
    [
      "Windows packaging must be run on Windows.",
      "",
      "Copy this project to the Windows PC, then run:",
      "  cd remote-control",
      "  npm install",
      "  npm run desktop:pack:win",
      "",
      "Building from another OS can package the wrong native nut.js binaries."
    ].join("\n")
  );

  process.exit(1);
}
