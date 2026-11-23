import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CustomMetadataFieldType } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import { customMetadataFields, customMetadataLibraryFields } from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

export interface LibraryField {
  libraryId: number;
  id: number;
  key: string;
  type: CustomMetadataFieldType;
}

export interface PendingBook {
  bookId: number;
  opfPath: string;
  /** Kept as Postgres text so the microseconds survive the round trip and still compare equal. */
  opfMtime: string | null;
  opfSize: number | null;
}

export interface BookState {
  bookId: number;
  opfPath: string;
  opfMtime: string | null;
  opfSize: number | null;
  signature: string;
}

const METADATA_OPF_PATTERN = '(^|[\\\\/])metadata\\.opf$';

/**
 * The fork keeps its own state table, created on startup outside the upstream migrations so that
 * renumbering upstream migrations never has to account for it.
 */
@Injectable()
export class CalibreColumnsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async ensureStateTable(): Promise<void> {
    await this.db.execute(sql`
      create table if not exists fork_calibre_column_state (
        book_id integer primary key references books(id) on delete cascade,
        opf_path text not null,
        opf_mtime timestamptz,
        opf_size bigint,
        links_signature text not null,
        synced_at timestamptz not null default now()
      )
    `);
  }

  listActiveFieldsByLibrary(): Promise<LibraryField[]> {
    return this.db
      .select({
        libraryId: customMetadataLibraryFields.libraryId,
        id: customMetadataFields.id,
        key: customMetadataFields.key,
        type: customMetadataFields.type,
      })
      .from(customMetadataLibraryFields)
      .innerJoin(customMetadataFields, and(eq(customMetadataFields.id, customMetadataLibraryFields.fieldId), isNull(customMetadataFields.archivedAt)))
      .orderBy(asc(customMetadataLibraryFields.libraryId), asc(customMetadataFields.id));
  }

  /** When each library's latest scan ended, in epoch ms. A failed scan may still have changed files. */
  async latestScanEndByLibrary(libraryIds: number[]): Promise<Map<number, number>> {
    if (libraryIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        libraryId: schema.scanJobs.libraryId,
        endedAt: sql<string | null>`max(${schema.scanJobs.completedAt})`,
      })
      .from(schema.scanJobs)
      .where(and(inArray(schema.scanJobs.libraryId, libraryIds), inArray(schema.scanJobs.status, ['completed', 'failed'])))
      .groupBy(schema.scanJobs.libraryId);
    const result = new Map<number, number>();
    for (const row of rows) if (row.endedAt) result.set(row.libraryId, new Date(row.endedAt).getTime());
    return result;
  }

  /**
   * Books of a library whose `metadata.opf` was not read yet, changed since (path, size or mtime as
   * the scanner recorded them), or was read under other field links. Keyset-paged by book id.
   */
  async findPendingBooks(libraryId: number, signature: string, afterBookId: number, limit: number): Promise<PendingBook[]> {
    const result = await this.db.execute(sql`
      select distinct on (b.id)
        b.id as book_id, f.absolute_path as opf_path, f.mtime::text as opf_mtime, f.size_bytes as opf_size
      from ${schema.books} b
      join ${schema.bookFiles} f
        on f.book_id = b.id and f.role = 'metadata' and f.format = 'opf' and f.absolute_path ~* ${METADATA_OPF_PATTERN}
      left join fork_calibre_column_state s on s.book_id = b.id
      where b.library_id = ${libraryId}
        and b.id > ${afterBookId}
        and (
          s.book_id is null
          or s.opf_path <> f.absolute_path
          or s.opf_mtime is distinct from f.mtime
          or s.opf_size is distinct from f.size_bytes
          or s.links_signature <> ${signature}
        )
      order by b.id, f.id
      limit ${limit}
    `);
    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
      bookId: Number(row['book_id']),
      opfPath: String(row['opf_path']),
      opfMtime: row['opf_mtime'] === null || row['opf_mtime'] === undefined ? null : (row['opf_mtime'] as string),
      opfSize: row['opf_size'] === null || row['opf_size'] === undefined ? null : Number(row['opf_size']),
    }));
  }

  async recordStates(states: BookState[]): Promise<void> {
    if (states.length === 0) return;
    const values = states.map(
      (state) => sql`(${state.bookId}, ${state.opfPath}, ${state.opfMtime}::timestamptz, ${state.opfSize}::bigint, ${state.signature}, now())`,
    );
    await this.db.execute(sql`
      insert into fork_calibre_column_state (book_id, opf_path, opf_mtime, opf_size, links_signature, synced_at)
      values ${sql.join(values, sql`, `)}
      on conflict (book_id) do update set
        opf_path = excluded.opf_path,
        opf_mtime = excluded.opf_mtime,
        opf_size = excluded.opf_size,
        links_signature = excluded.links_signature,
        synced_at = excluded.synced_at
    `);
  }
}
