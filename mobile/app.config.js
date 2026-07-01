const { execFileSync } = require("node:child_process");
const { hostname } = require("node:os");

module.exports = ({ config }) => {
  const displayName =
    process.env.REMOTE_APP_NAME?.trim() ||
    process.env.REMOTE_DEVICE_NAME?.trim() ||
    getDeviceName() ||
    config.name;

  return {
    ...config,
    name: displayName,
  };
};

function getDeviceName() {
  if (process.platform === "darwin") {
    for (const key of ["ComputerName", "LocalHostName"]) {
      try {
        const value = execFileSync("scutil", ["--get", key], {
          encoding: "utf8",
          timeout: 500,
        }).trim();

        if (value) {
          return value.slice(0, 80);
        }
      } catch {
        // fall back to the system hostname below
      }
    }
  }

  return hostname().replace(/\.local$/i, "").slice(0, 80);
}
