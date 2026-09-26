import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  fetchJson,
  filterListingsByName,
  matchOption,
  parseListingsPage,
  parseStoreItem,
  type FetchImpl,
} from '../src/scraper/store/catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, 'fixtures', 'raw');

function readRaw(name: string): unknown {
  return JSON.parse(readFileSync(resolve(RAW, name), 'utf8')) as unknown;
}

function stubFetch(handler: (url: string) => Response): FetchImpl {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(String(input)));
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('catalogue layer (SCRAPE-001)', () => {
  it('parses the captured listings page (no price/stock anywhere)', () => {
    const page = parseListingsPage(readRaw('api_v2_listings_p1_l24.json'));
    expect(page.page).toBe(1);
    expect(page.perPage).toBe(24);
    expect(page.totalPages).toBe(40);
    expect(page.count).toBe(960);
    expect(page.results.length).toBe(24);
    const first = page.results[0];
    if (first === undefined) throw new Error('no first listing');
    expect(first).toMatchObject({
      id: 2626,
      slug: 'redwick-ukulele-nano',
      name: 'Redwick Ukulele Nano',
    });
    expect(JSON.stringify(page)).not.toContain('47052');
  });

  it('parses the captured item with its option axis', () => {
    const item = parseStoreItem(readRaw('api_v2_items_2626.json'));
    expect(item.id).toBe(2626);
    expect(item.name).toBe('Redwick Ukulele Nano');
    expect(item.optionAxis).toBe('Bundle');
    expect(item.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(item.options[0]).toEqual({ id: 'o1', label: 'Instrument only' });
  });

  it('matches options exactly and fails safe otherwise', () => {
    const item = parseStoreItem(readRaw('api_v2_items_2626.json'));
    expect(matchOption(item, 'o1')).toEqual({
      ok: true,
      option: { id: 'o1', label: 'Instrument only' },
    });
    expect(matchOption(item, 'O1')).toEqual({
      ok: false,
      errorCode: 'option_not_found',
    });
    expect(matchOption(item, 'o9')).toEqual({
      ok: false,
      errorCode: 'option_not_found',
    });
    expect(
      matchOption(
        { ...item, options: [...item.options, { id: 'o1', label: 'Dupe' }] },
        'o1',
      ),
    ).toEqual({ ok: false, errorCode: 'option_ambiguous' });
  });

  it('searches client-side: partial/full, case-insensitive', () => {
    const page = parseListingsPage(readRaw('api_v2_listings_p1_l24.json'));
    const hits = filterListingsByName(page.results, 'ukulele');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.name).toContain('Ukulele');
    expect(filterListingsByName(page.results, 'REDWICK UKULELE NANO').length).toBe(1);
    expect(filterListingsByName(page.results, 'no-such-product-xyz').length).toBe(0);
    expect(filterListingsByName(page.results, '   ').length).toBe(0);
  });

  it('rejects malformed catalogue shapes loudly', () => {
    expect(() => parseListingsPage({})).toThrow(/pagination/);
    expect(() => parseStoreItem({ id: 1 })).toThrow(/id\/slug\/name/);
    expect(() =>
      parseStoreItem({ id: 1, slug: 's', name: 'n', options: [] }),
    ).toThrow(/no options/);
  });

  it('classifies fetch outcomes for the runner', async () => {
    const ok = await fetchJson(
      'https://x/items/1',
      'probe',
      stubFetch(() => jsonResponse({ id: 1 })),
    );
    expect(ok.ok).toBe(true);

    const rateLimited = await fetchJson(
      'https://x/items/1',
      'probe',
      stubFetch(() => jsonResponse({}, 429)),
    );
    expect(rateLimited).toMatchObject({
      ok: false,
      failure: { errorCode: 'http_429', transient: true },
    });

    const serverError = await fetchJson(
      'https://x/items/1',
      'probe',
      stubFetch(() => jsonResponse({}, 503)),
    );
    expect(serverError).toMatchObject({
      ok: false,
      failure: { errorCode: 'http_5xx', transient: true },
    });

    const missing = await fetchJson(
      'https://x/items/1',
      'probe',
      stubFetch(() => jsonResponse({}, 404)),
    );
    expect(missing).toMatchObject({
      ok: false,
      failure: { errorCode: 'item_not_found', transient: false },
    });

    const blewUp = await fetchJson('https://x/items/1', 'probe', () =>
      Promise.reject(new Error('fetch failed')),
    );
    expect(blewUp.ok).toBe(false);
    if (blewUp.ok) throw new Error('expected failure');
    expect(blewUp.failure.transient).toBe(true);
  });
});

describe('catalogue numeric shapes (audit item 19)', () => {
  const captured = (): Record<string, unknown> => ({
    ...(readRaw('api_v2_listings_p1_l24.json') as Record<string, unknown>),
  });

  it('rejects impossible pagination shapes through the existing drift path', () => {
    // All of these surface as the SAME 'missing pagination fields' throw the
    // route already maps to handshake_drift — no new error channel.
    expect(() => parseListingsPage({ ...captured(), page: 1.5 })).toThrow(
      /pagination/,
    );
    expect(() => parseListingsPage({ ...captured(), totalPages: -1 })).toThrow(
      /pagination/,
    );
    expect(() => parseListingsPage({ ...captured(), count: NaN })).toThrow(
      /pagination/,
    );
    expect(() => parseListingsPage({ ...captured(), perPage: 0 })).toThrow(
      /pagination/,
    );
    expect(() => parseListingsPage({ ...captured(), totalPages: '40' })).toThrow(
      /pagination/,
    );
  });

  it('rejects impossible entry/item id shapes', () => {
    const fractionalEntry = captured();
    const results = fractionalEntry['results'] as Array<Record<string, unknown>>;
    results[0] = { ...results[0]!, id: 26.5 };
    expect(() => parseListingsPage(fractionalEntry)).toThrow(/id\/slug\/name/);

    const negativeEntry = captured();
    const negativeResults = negativeEntry['results'] as Array<Record<string, unknown>>;
    negativeResults[1] = { ...negativeResults[1]!, id: -7 };
    expect(() => parseListingsPage(negativeEntry)).toThrow(/id\/slug\/name/);

    expect(() =>
      parseStoreItem({
        id: 1.5,
        slug: 's',
        name: 'n',
        options: [{ id: 'o1', label: 'x' }],
      }),
    ).toThrow(/id\/slug\/name/);
  });

  it('still accepts the captured store payload and zero-safe ids', () => {
    const page = parseListingsPage(captured());
    expect(page.page).toBe(1);
    expect(page.count).toBe(960);
    const zeroId = captured();
    const zeroResults = zeroId['results'] as Array<Record<string, unknown>>;
    zeroResults[0] = { ...zeroResults[0]!, id: 0 };
    expect(parseListingsPage(zeroId).results[0]?.id).toBe(0);
  });
});
