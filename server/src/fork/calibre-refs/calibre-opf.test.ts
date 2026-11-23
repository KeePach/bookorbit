import { parseCalibreOpfRefs } from './calibre-opf';

describe('parseCalibreOpfRefs', () => {
  it('reads the uuid and numeric book id from a Calibre library metadata.opf', () => {
    const xml = `<metadata>
      <dc:identifier opf:scheme="calibre" id="calibre_id">3234</dc:identifier>
      <dc:identifier opf:scheme="uuid" id="uuid_id">41499828-334D-467e-93ca-cc81d7ec47ba</dc:identifier>
      <dc:identifier opf:scheme="URL">https://example.com/story</dc:identifier>
    </metadata>`;

    expect(parseCalibreOpfRefs(xml)).toEqual({ uuid: '41499828-334d-467e-93ca-cc81d7ec47ba', calibreBookId: 3234 });
  });

  it('takes a uuid from the calibre scheme, as in a copy Calibre sent to a device', () => {
    const xml = `<dc:identifier opf:scheme="calibre">41499828-334d-467e-93ca-cc81d7ec47ba</dc:identifier>`;

    expect(parseCalibreOpfRefs(xml)).toEqual({ uuid: '41499828-334d-467e-93ca-cc81d7ec47ba', calibreBookId: null });
  });

  it('returns null without a Calibre uuid', () => {
    const xml = `<dc:identifier id="fanficfare-uid">fanficfare-uid:example</dc:identifier>
      <dc:identifier opf:scheme="calibre">3234</dc:identifier>
      <dc:identifier opf:scheme="uuid">not-a-uuid</dc:identifier>`;

    expect(parseCalibreOpfRefs(xml)).toBeNull();
  });
});
