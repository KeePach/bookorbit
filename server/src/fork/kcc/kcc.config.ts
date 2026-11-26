import { registerAs } from '@nestjs/config';

export const kccConfig = registerAs('forkKcc', () => ({
  /** Base URL of the KCC container (docker/fork-kcc), for example http://kcc:8090. Empty turns KCC off. */
  url: (process.env.FORK_KCC_URL ?? '').trim().replace(/\/+$/, ''),
  /** Folder shared with the KCC container, where it sees it as its work folder. */
  workDir: (process.env.FORK_KCC_WORK_DIR ?? '').trim() || '/data/fork-kcc',
  /** Longest one conversion may take before BookOrbit gives up on it. */
  timeoutSeconds: parsePositiveInteger(process.env.FORK_KCC_TIMEOUT_SECONDS, 3600),
}));

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw.trim());
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
