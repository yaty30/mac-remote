import { spawn } from "node:child_process";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electron = spawn("electron", ["."], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

electron.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

electron.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
