if (process.platform !== "darwin") {
  console.error(
    [
      "Mac packaging must be run on macOS.",
      "",
      "Copy this project to the iMac, then run:",
      "  cd remote-control",
      "  npm install",
      "  npm run desktop:pack:mac",
      "",
      "Building from Windows can package the wrong native nut.js binaries."
    ].join("\n")
  );

  process.exit(1);
}
