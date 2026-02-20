export type Mode = "off" | "rfc_xml" | "read" | "apply_patch" | "both";

export interface Config {
  mode: Mode;
  overwrite: boolean;
}
