import type {
  KccBatchConvertRequest,
  KccBatchConvertResult,
  KccConvertCheck,
  KccConvertJob,
  KccConvertRequest,
  KccJobList,
  KccPagesInfo,
  KccOptionSchema,
  KccPreset,
  KccPresetInput,
  KccStatus,
} from '@bookorbit/types'
import { ApiError, apiJson, apiSend, jsonBody } from '@/lib/api-json'

const BASE = '/api/v1/fork/kcc'
const FALLBACK = 'forkKcc.error'

export const kccApi = {
  status: () => apiJson<KccStatus>(`${BASE}/status`, undefined, FALLBACK),
  options: () => apiJson<KccOptionSchema>(`${BASE}/options`, undefined, FALLBACK),
  presets: () => apiJson<KccPreset[]>(`${BASE}/presets`, undefined, FALLBACK),
  createPreset: (input: KccPresetInput) => apiJson<KccPreset>(`${BASE}/presets`, jsonBody('POST', input), FALLBACK),
  updatePreset: (id: number, input: KccPresetInput) => apiJson<KccPreset>(`${BASE}/presets/${id}`, jsonBody('PUT', input), FALLBACK),
  deletePreset: (id: number) => apiSend(`${BASE}/presets/${id}`, { method: 'DELETE' }, FALLBACK),
  check: (bookId: number) => apiJson<KccConvertCheck>(`${BASE}/books/${bookId}/check`, undefined, FALLBACK),
  pages: (bookId: number) => apiJson<KccPagesInfo>(`${BASE}/books/${bookId}/pages`, undefined, FALLBACK),
  latestJob: (bookId: number) => apiJson<{ job: KccConvertJob | null }>(`${BASE}/books/${bookId}/job`, undefined, FALLBACK),
  convert: (bookId: number, request: KccConvertRequest) =>
    apiJson<KccConvertJob>(`${BASE}/books/${bookId}/convert`, jsonBody('POST', request), FALLBACK),
  convertMany: (request: KccBatchConvertRequest) => apiJson<KccBatchConvertResult>(`${BASE}/convert`, jsonBody('POST', request), FALLBACK),
  jobs: (since?: string) => apiJson<KccJobList>(`${BASE}/jobs${since ? `?since=${encodeURIComponent(since)}` : ''}`, undefined, FALLBACK),
  job: (id: string) => apiJson<KccConvertJob>(`${BASE}/jobs/${id}`, undefined, FALLBACK),
}

/** Small WebP of one page (0-based, comic reader order), for the Pages tab. Loads with the session cookie. */
export function kccPageThumbUrl(bookId: number, pageIndex: number): string {
  return `${BASE}/books/${bookId}/pages/${pageIndex}/thumb`
}

/** The fork's server messages are written for the user, so they are shown as they are. */
export function kccErrorText(reason: unknown): string {
  if (reason instanceof ApiError) return reason.serverMessage ?? reason.message
  return reason instanceof Error && reason.message ? reason.message : 'Something went wrong'
}

export function kccErrorCode(reason: unknown): string | null {
  return reason instanceof ApiError ? reason.errorCode : null
}

/** KCC reads these formats; the result is always CBZ. */
export const KCC_SOURCE_FORMATS = new Set(['cbz', 'cbr', 'cb7', 'pdf'])
