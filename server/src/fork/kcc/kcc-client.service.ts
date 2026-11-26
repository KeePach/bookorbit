import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { KccOptionGroup, KccProfile, KccStatus } from '@bookorbit/types';

import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { kccConfig } from './kcc.config';

export interface KccRemoteSchema {
  version: string | null;
  groups: KccOptionGroup[];
  profiles: KccProfile[];
}

export interface KccRemoteJob {
  state: 'queued' | 'running' | 'done' | 'failed';
  outputs: string[] | null;
  log: string | null;
  exitCode: number | null;
}

const REQUEST_TIMEOUT_MS = 15_000;
const SCHEMA_CACHE_MS = 5 * 60_000;

/** Talks to the KCC container (docker/fork-kcc/server.py). Paths are relative to the shared work folder. */
@Injectable()
export class KccClientService {
  private readonly logger = new Logger(KccClientService.name);
  private schemaCache: { value: KccRemoteSchema; at: number } | null = null;

  constructor(@Inject(kccConfig.KEY) private readonly config: ConfigType<typeof kccConfig>) {}

  get configured(): boolean {
    return this.config.url !== '';
  }

  async status(): Promise<KccStatus> {
    if (!this.configured) return { configured: false, reachable: false, version: null, error: null };
    try {
      const body = await this.request<{ version: string | null }>('GET', '/health');
      return { configured: true, reachable: true, version: body.version ?? null, error: null };
    } catch (error) {
      return { configured: true, reachable: false, version: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async schema(): Promise<KccRemoteSchema> {
    if (this.schemaCache && Date.now() - this.schemaCache.at < SCHEMA_CACHE_MS) return this.schemaCache.value;
    const value = await this.request<KccRemoteSchema>('GET', '/options');
    this.schemaCache = { value, at: Date.now() };
    return value;
  }

  async startJob(input: string, outputDir: string, args: string[]): Promise<string> {
    const body = await this.request<{ id: string }>('POST', '/jobs', { input, outputDir, args });
    return body.id;
  }

  getJob(id: string): Promise<KccRemoteJob> {
    return this.request<KccRemoteJob>('GET', `/jobs/${encodeURIComponent(id)}`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new ServiceUnavailableException({ errorCode: 'KCC_NOT_CONFIGURED', message: 'KCC is not set up (FORK_KCC_URL)' });
    let response: Response;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[fork.kcc.request] [fail] method=${method} path="${sanitizeLogValue(path)}" error="${sanitizeLogValue(message)}" - KCC unreachable`,
      );
      throw new ServiceUnavailableException({ errorCode: 'KCC_UNREACHABLE', message: `KCC container unreachable: ${message}` });
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const message = (parsed as { error?: string } | null)?.error ?? `HTTP ${response.status}`;
      throw new ServiceUnavailableException({ errorCode: 'KCC_REQUEST_FAILED', message: `KCC: ${message}` });
    }
    return parsed as T;
  }
}
