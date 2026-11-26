/** Fork-only: converting comics with KCC (Kindle Comic Converter) from inside BookOrbit. */

export type KccOptionKind = "bool" | "int" | "float" | "str";

/** One option exactly as KCC's own command-line parser defines it. */
export interface KccOptionDef {
  dest: string;
  flags: string[];
  kind: KccOptionKind;
  default: boolean | number | string | null;
  help: string;
}

export interface KccOptionGroup {
  title: string;
  options: KccOptionDef[];
}

export interface KccProfile {
  code: string;
  label: string;
}

export interface KccStatus {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  error: string | null;
}

export interface KccOptionSchema {
  version: string | null;
  groups: KccOptionGroup[];
  profiles: KccProfile[];
  /** Options BookOrbit sets itself (output, format, splitting, deleting the source...). Never in a preset. */
  managed: string[];
}

export type KccOptionValues = Record<string, boolean | number | string>;

export interface KccPreset {
  id: number;
  name: string;
  options: KccOptionValues;
  createdAt: string;
  updatedAt: string;
}

export interface KccPresetInput {
  name: string;
  options: KccOptionValues;
}

export type KccConvertMode = "replace" | "keep";

export interface KccConvertCheck {
  bookId: number;
  fileName: string;
  format: string | null;
  /** Page names inside the CBZ show KCC already processed it. */
  alreadyConverted: boolean;
  canReplace: boolean;
  replaceBlockedReason: string | null;
  canKeep: boolean;
  keepBlockedReason: string | null;
  keepCopyName: string;
  keepCopyExists: boolean;
}

export interface KccConvertRequest {
  mode: KccConvertMode;
  presetId?: number;
  options?: KccOptionValues;
  /** Convert even though the file looks converted, or the _kcc copy already exists. */
  force?: boolean;
}

export type KccJobState = "queued" | "running" | "done" | "failed";

export interface KccConvertJob {
  id: string;
  bookId: number;
  mode: KccConvertMode;
  state: KccJobState;
  error: string | null;
  /** File name of the result in the book's folder. */
  outputName: string | null;
  /** Preset options KCC no longer knows; they were left out. */
  ignoredOptions: string[];
  createdAt: string;
  finishedAt: string | null;
}
