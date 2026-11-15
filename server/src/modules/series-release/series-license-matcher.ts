import type { SeriesLicenseMatchedBy } from '@bookorbit/types';

export interface LicenseCandidate {
  seriesId: number;
  name: string;
  /** The MangaBaka id BookOrbit already stored for this series' books, when there is one. */
  mangabakaId: string | null;
}

export interface LicenseMatch {
  seriesId: number;
  licensed: boolean;
  mangabakaId: string | null;
  matchedBy: SeriesLicenseMatchedBy | null;
  publishers: string | null;
}

/** The dump is untyped JSON, so only strings and numbers become text; anything else is ''. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** Ported from the userscript: accent-insensitive, letters and digits only. */
export function normTitle(value: unknown): string {
  return asText(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A BookOrbit series name, with and without its [bracketed] part, as match candidates. */
export function titleCandidates(name: string): string[] {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];
  const out = new Set([trimmed]);
  const outer = trimmed.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
  const inner = /\[([^\]]+)\]/.exec(trimmed);
  if (outer) out.add(outer);
  if (inner) out.add(inner[1]);
  return [...out];
}

interface LicensedEntry {
  publishers: string[];
}

const TITLE_AMBIGUOUS = -1;

/**
 * One pass over the MangaBaka dump, the userscript's matching rules intact: a known MangaBaka id
 * decides on its own (merged ids are followed); only a series without one is matched by title,
 * and only when exactly one licensed MangaBaka series carries that title. It keeps just the
 * licensed entries, the merge map and a title index, so the dump itself is never held in memory.
 */
export class LicenseMatcher {
  private readonly candidates: LicenseCandidate[];
  private readonly licensed = new Map<string, LicensedEntry>();
  private readonly merged = new Map<string, string>();
  private readonly titleIndex = new Map<string, string | typeof TITLE_AMBIGUOUS>();
  private seen = 0;

  constructor(candidates: LicenseCandidate[]) {
    this.candidates = candidates;
  }

  get linesSeen(): number {
    return this.seen;
  }

  /** One parsed dump record; anything malformed is counted and skipped. */
  feed(record: unknown): void {
    this.seen++;
    if (!record || typeof record !== 'object') return;
    const entry = record as Record<string, unknown>;
    const id = asText(entry.id);
    if (entry.state === 'deleted' || !id) return;
    if (entry.merged_with != null) {
      const merged = asText(entry.merged_with);
      if (merged) this.merged.set(id, merged);
      return;
    }
    if (entry.is_licensed !== true) return;

    const publishers = Array.isArray(entry.publishers)
      ? (entry.publishers as { name?: unknown; type?: unknown }[])
          .filter((p) => p && p.type === 'English' && typeof p.name === 'string' && p.name)
          .map((p) => p.name as string)
      : [];
    this.licensed.set(id, { publishers });

    const titles = new Set<unknown>([entry.title, entry.romanized_title, entry.native_title]);
    if (Array.isArray(entry.titles)) {
      for (const t of entry.titles as { title?: unknown; language?: unknown }[]) {
        if (t && typeof t.title === 'string' && t.title && /^en/i.test(asText(t.language))) titles.add(t.title);
      }
    }
    for (const raw of titles) {
      const norm = normTitle(raw);
      if (norm.length < 2) continue;
      const current = this.titleIndex.get(norm);
      if (current === undefined) this.titleIndex.set(norm, id);
      else if (current !== id) this.titleIndex.set(norm, TITLE_AMBIGUOUS);
    }
  }

  finish(): LicenseMatch[] {
    return this.candidates.map((candidate) => {
      if (candidate.mangabakaId) {
        const resolved = this.resolve(candidate.mangabakaId);
        const entry = this.licensed.get(resolved);
        return {
          seriesId: candidate.seriesId,
          licensed: entry !== undefined,
          mangabakaId: resolved,
          matchedBy: 'id' as const,
          publishers: entry && entry.publishers.length > 0 ? entry.publishers.join(', ') : null,
        };
      }
      const hits = new Set<string>();
      for (const title of titleCandidates(candidate.name)) {
        const hit = this.titleIndex.get(normTitle(title));
        if (hit !== undefined && hit !== TITLE_AMBIGUOUS) hits.add(hit);
      }
      if (hits.size === 1) {
        const id = [...hits][0];
        const entry = this.licensed.get(id);
        return {
          seriesId: candidate.seriesId,
          licensed: true,
          mangabakaId: id,
          matchedBy: 'title' as const,
          publishers: entry && entry.publishers.length > 0 ? entry.publishers.join(', ') : null,
        };
      }
      return { seriesId: candidate.seriesId, licensed: false, mangabakaId: null, matchedBy: null, publishers: null };
    });
  }

  private resolve(rawId: string): string {
    let id = rawId;
    for (let hop = 0; hop < 6; hop++) {
      const next = this.merged.get(id);
      if (next == null) break;
      id = next;
    }
    return id;
  }
}
