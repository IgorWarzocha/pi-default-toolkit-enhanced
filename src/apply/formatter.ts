import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".vue",
  ".svelte",
  ".astro",
  ".graphql",
  ".yaml",
  ".yml",
]);

function isSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function runBiome(filePath: string, content: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["biome", "format", "--stdin-file-path", filePath, "--config-path", process.cwd()],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      }
    );

    let stdout = "";
    let stderr = "";
    let stdoutEnded = false;
    let processClosed = false;
    let exitCode: number | null = null;

    const checkComplete = () => {
      if (stdoutEnded && processClosed) {
        if (exitCode === 0 && stdout.length > 0) {
          resolve(stdout);
        } else if (exitCode === 0 && content.length === 0) {
          resolve(stdout);
        } else {
          resolve(null);
        }
      }
    };

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stdout.on("end", () => {
      stdoutEnded = true;
      checkComplete();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      exitCode = code;
      processClosed = true;
      checkComplete();
    });

    child.on("error", () => {
      resolve(null);
    });

    child.stdin.on("error", () => {
      resolve(null);
    });

    child.stdin.write(content);
    child.stdin.end();
  });
}

export async function formatContent(filePath: string, content: string): Promise<string> {
  if (!isSupported(filePath)) {
    return content;
  }

  try {
    const formatted = await runBiome(filePath, content);
    if (formatted !== null && formatted.length > 0) {
      return formatted;
    }
    if (formatted !== null && formatted.length === 0 && content.length === 0) {
      return formatted;
    }
    return content;
  } catch {
    return content;
  }
}

export async function formatFile(filePath: string): Promise<boolean> {
  if (!isSupported(filePath)) {
    return false;
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const formatted = await formatContent(filePath, content);
    if (formatted !== content) {
      await fs.writeFile(filePath, formatted, "utf-8");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
