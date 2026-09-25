import {
  fetchJson,
  itemUrl,
  matchOption,
  parseStoreItem,
  type FetchImpl,
  type StoreItem,
} from './catalog.js';
import { acquireQuote, type HandshakeDeps } from './handshake.js';
import { PARSER_VERSION, STORE_BASE_URL } from './constants.js';
import { errMsg } from '../../http/guards.js';
import {
  isTransientCode,
  type ScrapeErrorCode,
  type ScrapeFailure,
  type ScrapeInput,
  type ScrapeResult,
  type ScrapeSuccess,
} from './types.js';

/**
 * SCRAPE-001 entry point: validated price/stock for one tracked target, or a
 * typed failure. Never throws for domain failures — only for programmer
 * errors (which the `never` branch below turns into a terminal failure
 * rather than a crash, so the runner always gets a row to persist).
 */

export interface ScrapeDeps extends HandshakeDeps {
  baseUrl?: string;
}

function fail(
  input: ScrapeInput,
  productName: string | undefined,
  errorCode: ScrapeErrorCode,
  errorMessage: string,
  started: number,
  now: number,
): ScrapeFailure {
  const failure: ScrapeFailure = {
    ok: false,
    productId: input.productId,
    selectedOption: input.selectedOption,
    errorCode,
    errorMessage,
    durationMs: now - started,
    transient: isTransientCode(errorCode),
  };
  if (productName !== undefined) failure.productName = productName;
  return failure;
}

/**
 * Guard the validation gate (PRODUCT_ARCHITECTURE_AND_FLOW.md section 5):
 * missing/malformed price, missing stock, wrong identity, unlisted option.
 * Anything uncertain fails safely — never a plausible-looking wrong value.
 */
export function scrapeProduct(
  input: ScrapeInput,
  deps: ScrapeDeps = {},
): Promise<ScrapeResult> {
  return runScrape(input, deps);
}

async function runScrape(
  input: ScrapeInput,
  deps: ScrapeDeps,
): Promise<ScrapeResult> {
  const baseUrl = deps.baseUrl ?? STORE_BASE_URL;
  const fetchImpl: FetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const started = now();

  if (!/^\d+$/.test(input.productId)) {
    return fail(
      input,
      undefined,
      'bad_product_id',
      `product id "${input.productId}" is not numeric`,
      started,
      now(),
    );
  }
  const itemId = Number(input.productId);

  const itemResponse = await fetchJson(
    itemUrl(baseUrl, itemId),
    `item ${itemId}`,
    fetchImpl,
  );
  if (!itemResponse.ok) {
    const { errorCode, errorMessage } = itemResponse.failure;
    const code: ScrapeErrorCode =
      errorCode === 'item_not_found' ||
      errorCode === 'timeout' ||
      errorCode === 'connection_reset' ||
      errorCode === 'http_429' ||
      errorCode === 'http_5xx'
        ? errorCode
        : 'handshake_drift';
    return fail(input, undefined, code, errorMessage, started, now());
  }
  let item: StoreItem;
  try {
    item = parseStoreItem(itemResponse.json);
  } catch (error) {
    const message = errMsg(error);
    return fail(
      input,
      undefined,
      'handshake_drift',
      `item ${itemId} changed shape: ${message}`,
      started,
      now(),
    );
  }
  if (item.id !== itemId) {
    return fail(
      input,
      item.name,
      'validation_identity',
      `item identity mismatch: requested ${itemId}, store returned ${item.id}`,
      started,
      now(),
    );
  }

  const matched = matchOption(item, input.selectedOption);
  if (!matched.ok) {
    return fail(
      input,
      item.name,
      matched.errorCode,
      matched.errorCode === 'option_ambiguous'
        ? `option "${input.selectedOption}" matches ${item.options.length} entries (storefront drift?)`
        : `option "${input.selectedOption}" is not listed for item ${itemId} (axis: ${item.optionAxis ?? 'unknown'}; options: ${item.options.map((o) => o.id).join(',') || 'none'})`,
      started,
      now(),
    );
  }

  const acquired = await acquireQuote(baseUrl, itemId, matched.option.id, deps);
  if (!acquired.ok) {
    return fail(
      input,
      item.name,
      acquired.failure.errorCode,
      acquired.failure.errorMessage,
      started,
      now(),
    );
  }
  const { price, stock } = acquired.quote.payload;
  if (!Number.isFinite(price) || price <= 0) {
    return fail(
      input,
      item.name,
      'validation_price',
      `quote price failed validation: ${String(price)}`,
      started,
      now(),
    );
  }
  const stockText = String(stock);
  if (stockText.trim() === '') {
    return fail(
      input,
      item.name,
      'validation_stock',
      'quote stock failed validation: empty',
      started,
      now(),
    );
  }

  const success: ScrapeSuccess = {
    ok: true,
    productId: input.productId,
    productName: item.name,
    selectedOption: matched.option.id,
    price,
    stock: stockText,
    durationMs: now() - started,
    fetchStrategy: 'http',
    parserVersion: PARSER_VERSION,
  };
  return success;
}
