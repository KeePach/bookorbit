import type { ReadAloudDeliveryPreference } from "./delivery";

export interface KoboDevice {
  id: number;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface KoboDeviceWithToken extends KoboDevice {
  token: string;
}

export const KOBO_KEPUB_TITLE_PAGE_MODES = ["auto", "on", "off"] as const;
export type KoboKepubTitlePageMode = (typeof KOBO_KEPUB_TITLE_PAGE_MODES)[number];
export const KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH = 10000;

export interface KoboSyncSettings {
  readingThreshold: number;
  finishedThreshold: number;
  convertToKepub: boolean;
  forceEnableHyphenation: boolean;
  kepubCustomCss: string;
  kepubFullscreenReadingFixes: boolean;
  kepubTitlePage: KoboKepubTitlePageMode;
  kepubDetectCover: boolean;
  kepubConversionLimitMb: number;
  twoWayProgressSync: boolean;
  syncBookOrbitAnnotationsToKobo: boolean;
  readAloudDelivery?: ReadAloudDeliveryPreference;
  storeSync: boolean;
  fullSizeCovers: boolean;
}

export type KoboSyncHistoryEvent = "library_sync" | "book_download" | "progress_update" | "annotations_pull" | "annotations_push";

export type KoboSyncHistoryStatus = "success" | "failed";

export type KoboSyncHistoryCounts = Record<string, number | boolean | string | null>;

export interface KoboSyncHistoryEntry {
  id: number;
  deviceId: number | null;
  deviceName: string | null;
  event: KoboSyncHistoryEvent;
  status: KoboSyncHistoryStatus;
  counts: KoboSyncHistoryCounts;
  durationMs: number;
  errorClass: string | null;
  error: string | null;
  createdAt: string;
}

export interface CreateKoboDeviceRequest {
  name: string;
}

export interface RenameKoboDeviceRequest {
  name: string;
}

export interface UpdateKoboSyncSettingsRequest {
  readingThreshold?: number;
  finishedThreshold?: number;
  convertToKepub?: boolean;
  forceEnableHyphenation?: boolean;
  kepubCustomCss?: string;
  kepubFullscreenReadingFixes?: boolean;
  kepubTitlePage?: KoboKepubTitlePageMode;
  kepubDetectCover?: boolean;
  kepubConversionLimitMb?: number;
  twoWayProgressSync?: boolean;
  syncBookOrbitAnnotationsToKobo?: boolean;
  readAloudDelivery?: ReadAloudDeliveryPreference;
  storeSync?: boolean;
  fullSizeCovers?: boolean;
}
