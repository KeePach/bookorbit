import type { KccOptionDef, KccOptionGroup, KccOptionValues } from '@bookorbit/types';

/**
 * KCC options BookOrbit sets itself, by KCC's `dest` name. They never come from a preset:
 * - output, filename, format: the result must be one CBZ in the job's own folder;
 * - batchsplit, targetsize: splitting would give several files for one book;
 * - delete: deletes the source; filefusion merges several inputs;
 * - tempdir: always on, so KCC works next to the job's input in the shared folder;
 * - title, author, keepcomicinfo, metadatatitle: BookOrbit writes ComicInfo.xml after converting;
 * - noKepub: EPUB only.
 */
export const KCC_MANAGED_OPTIONS = [
  'output',
  'filename',
  'format',
  'batchsplit',
  'targetsize',
  'delete',
  'filefusion',
  'tempdir',
  'title',
  'author',
  'keepcomicinfo',
  'metadatatitle',
  'noKepub',
] as const;

const MANAGED = new Set<string>(KCC_MANAGED_OPTIONS);
const DEST_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const MAX_PRESET_OPTIONS = 100;
const MAX_STRING_VALUE = 200;

/** Arguments BookOrbit always passes, after the user's options. */
export const KCC_FIXED_ARGS = ['--format', 'CBZ', '--batchsplit', '0', '--tempdir'];

/** Shape check for stored options, done without asking KCC. Returns a problem or null. */
export function validateOptionValues(options: unknown): string | null {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) return 'options must be an object';
  const entries = Object.entries(options as Record<string, unknown>);
  if (entries.length > MAX_PRESET_OPTIONS) return 'too many options';
  for (const [dest, value] of entries) {
    if (!DEST_PATTERN.test(dest)) return `invalid option name ${dest}`;
    if (MANAGED.has(dest)) return `${dest} is set by BookOrbit`;
    if (typeof value === 'boolean') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value === 'string' && value.length <= MAX_STRING_VALUE && !value.includes('\0')) continue;
    return `invalid value for ${dest}`;
  }
  return null;
}

function preferredFlag(option: KccOptionDef): string {
  return option.flags.find((flag) => flag.startsWith('--')) ?? option.flags[0];
}

export interface BuiltKccArgs {
  args: string[];
  /** Options KCC (in the running version) doesn't have; left out. */
  ignored: string[];
}

/**
 * Turns stored option values into KCC arguments, using KCC's own option list so a flag that
 * changes name between versions still works. Values equal to KCC's default are left out.
 */
export function buildKccArgs(values: KccOptionValues, groups: KccOptionGroup[]): BuiltKccArgs {
  const byDest = new Map<string, KccOptionDef>();
  for (const group of groups) for (const option of group.options) byDest.set(option.dest, option);

  const args: string[] = [];
  const ignored: string[] = [];
  for (const [dest, value] of Object.entries(values)) {
    const option = byDest.get(dest);
    if (!option || MANAGED.has(dest)) {
      ignored.push(dest);
      continue;
    }
    const flag = preferredFlag(option);
    if (option.kind === 'bool') {
      if (value === true && option.default !== true) args.push(flag);
      continue;
    }
    if (value === '' || value === option.default) continue;
    if (option.kind === 'int') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(number)) {
        ignored.push(dest);
        continue;
      }
      args.push(flag, String(number));
    } else if (option.kind === 'float') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) {
        ignored.push(dest);
        continue;
      }
      args.push(flag, String(number));
    } else {
      args.push(flag, String(value));
    }
  }
  return { args: [...args, ...KCC_FIXED_ARGS], ignored };
}
