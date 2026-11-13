import { createWriteStream } from 'fs';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { ZipArchive } from 'archiver';
import * as unzipper from 'unzipper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { keepCoverAspectRatio, keepSvgAspectRatio } from './kepub-cover-aspect';

const STRETCHED_COVER = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><div>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="100%" height="100%" viewBox="0 0 471 751" preserveAspectRatio="none">
<image width="471" height="751" xlink:href="cover.jpeg"/>
</svg></div></body></html>`;

describe('keepSvgAspectRatio', () => {
  it('fits a stretched svg inside its box, whichever quotes the attribute uses', () => {
    expect(keepSvgAspectRatio('<svg viewBox="0 0 1 1" preserveAspectRatio="none">')).toBe(
      '<svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">',
    );
    expect(keepSvgAspectRatio("<svg preserveAspectRatio='none'>")).toBe("<svg preserveAspectRatio='xMidYMid meet'>");
    expect(keepSvgAspectRatio('<image preserveAspectRatio="none" width="1"/>')).toBe('<image preserveAspectRatio="xMidYMid meet" width="1"/>');
  });

  it('leaves other aspect settings and ordinary text alone', () => {
    const untouched = [
      '<svg preserveAspectRatio="xMidYMid slice">',
      '<svg preserveAspectRatio="xMidYMid meet">',
      '<p>the attribute preserveAspectRatio="none" stretches a picture</p>',
      '<div preserveAspectRatio="none">',
      '<svg viewBox="0 0 1 1">',
    ];
    for (const markup of untouched) expect(keepSvgAspectRatio(markup)).toBe(markup);
  });
});

describe('keepCoverAspectRatio', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kepub-aspect-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function buildKepub(name: string, pages: Record<string, string>): Promise<string> {
    const path = join(dir, name);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const output = createWriteStream(path);
    const closed = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(output);
    archive.append(Buffer.from('application/epub+zip'), { name: 'mimetype', store: true });
    archive.append(Buffer.from('<container/>'), { name: 'META-INF/container.xml' });
    archive.append(Buffer.from([1, 2, 3, 4]), { name: 'OEBPS/cover.jpeg' });
    for (const [entryName, content] of Object.entries(pages)) archive.append(Buffer.from(content), { name: entryName });
    await Promise.all([archive.finalize(), closed]);
    return path;
  }

  async function readEntries(path: string): Promise<{ names: string[]; contents: Map<string, Buffer>; stored: boolean }> {
    const zip = await unzipper.Open.file(path);
    const contents = new Map<string, Buffer>();
    for (const entry of zip.files) if (entry.type === 'File') contents.set(entry.path, await entry.buffer());
    return { names: zip.files.map((entry) => entry.path), contents, stored: zip.files[0]?.compressionMethod === 0 };
  }

  it('fits a stretched cover and keeps every other entry as it was', async () => {
    const path = await buildKepub('book.kepub.epub', {
      'OEBPS/cover.xhtml': STRETCHED_COVER,
      'OEBPS/ch1.xhtml': '<html><body><p>Text</p></body></html>',
    });

    await expect(keepCoverAspectRatio(path)).resolves.toBe(true);

    const result = await readEntries(path);
    expect(result.names[0]).toBe('mimetype');
    expect(result.stored).toBe(true);
    expect(result.contents.get('mimetype')?.toString()).toBe('application/epub+zip');
    expect(result.contents.get('OEBPS/cover.xhtml')?.toString()).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result.contents.get('OEBPS/cover.xhtml')?.toString()).not.toContain('preserveAspectRatio="none"');
    expect(result.contents.get('OEBPS/ch1.xhtml')?.toString()).toBe('<html><body><p>Text</p></body></html>');
    expect([...(result.contents.get('OEBPS/cover.jpeg') ?? [])]).toEqual([1, 2, 3, 4]);
    expect(result.contents.get('META-INF/container.xml')?.toString()).toBe('<container/>');
  });

  it('leaves the file byte for byte alone when no page is stretched', async () => {
    const path = await buildKepub('plain.kepub.epub', { 'OEBPS/ch1.xhtml': '<html><body><svg viewBox="0 0 1 1"/></body></html>' });
    const before = await readFile(path);

    await expect(keepCoverAspectRatio(path)).resolves.toBe(false);

    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it('leaves no temporary file behind', async () => {
    const path = await buildKepub('tidy.kepub.epub', { 'OEBPS/cover.xhtml': STRETCHED_COVER });

    await keepCoverAspectRatio(path);

    expect((await readdir(dir)).filter((name) => name.endsWith('.aspect'))).toEqual([]);
  });
});
