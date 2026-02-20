export type Mode = "off" | "read" | "apply_patch" | "both";

export interface Config {
  mode: Mode;
  overwrite: boolean;
}
