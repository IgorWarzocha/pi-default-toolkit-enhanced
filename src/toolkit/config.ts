import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "./types.js";

const DIR = join(homedir(), ".pi");
const FILE = join(DIR, "toolkit.json");
const SYSTEM = join(DIR, "SYSTEM.md");

export function base(): Config {
  return { mode: "off", overwrite: false };
}

export async function load(): Promise<Config> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (!parsed || typeof parsed !== "object") {
      return base();
    }
    const mode = parsed.mode === "rfc_xml" || parsed.mode === "read" || parsed.mode === "apply_patch" || parsed.mode === "both" || parsed.mode === "off" ? parsed.mode : "off";
    const overwrite = parsed.overwrite === true;
    return { mode, overwrite };
  } catch {
    return base();
  }
}

export async function save(next: Config): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

export async function saveSystem(prompt: string): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(SYSTEM, `${prompt}\n`, "utf-8");
}

export async function clearSystem(): Promise<void> {
  try {
    await unlink(SYSTEM);
  } catch (error) {
    const typed = error as NodeJS.ErrnoException;
    if (typed.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export function path(): string {
  return FILE;
}

export async function hasSystem(): Promise<boolean> {
  try {
    await access(SYSTEM);
    return true;
  } catch {
    return false;
  }
}

export function systemPath(): string {
  return SYSTEM;
}
