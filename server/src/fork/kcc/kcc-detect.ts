import { basename, extname } from 'node:path';

import * as unzipper from 'unzipper';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.jxl', '.avif']);
// KCC renames every page to kcc-0001 (sanitizeTree) and, when it processes the image, adds a
// suffix such as -kcc-x, -kcc-b or -kcc-x-above (image.py).
const KCC_PAGE = /^kcc-\d{4}(?:-kcc-[a-z](?:-(?:above|below|whole))?)?$/i;

export function isImageEntry(entryPath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(entryPath).toLowerCase());
}

/** True when most pages carry KCC's names, so the archive is KCC output. */
export function looksConvertedByKcc(entryPaths: readonly string[]): boolean {
  const pages = entryPaths.filter((path) => !path.endsWith('/') && isImageEntry(path));
  if (pages.length === 0) return false;
  const kccPages = pages.filter((path) => KCC_PAGE.test(basename(path, extname(path)))).length;
  return kccPages * 2 > pages.length;
}

export async function readZipEntryPaths(filePath: string): Promise<string[]> {
  const zip = await unzipper.Open.file(filePath);
  return zip.files.filter((entry) => entry.type === 'File').map((entry) => entry.path.replace(/\\/g, '/'));
}

export async function countZipImages(filePath: string): Promise<number> {
  return (await readZipEntryPaths(filePath)).filter(isImageEntry).length;
}

/** `Name.cbz` -> `Name_kcc.cbz` (always .cbz, since KCC's output is CBZ). */
export function keepCopyName(fileName: string): string {
  const stem = basename(fileName, extname(fileName));
  return `${stem}_kcc.cbz`;
}
