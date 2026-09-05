import { execFile } from "node:child_process";

export function runExecutable(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim();

        if (detail) {
          error.message = `${error.message}: ${detail}`;
        }

        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
