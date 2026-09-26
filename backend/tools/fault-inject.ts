/**
 * TOOLS-ONLY fault seam for the recorded demo (audit Item 4).
 *
 * Lives in backend/tools/ so src/ can never import it (src only depends on
 * src/; nothing under src/ references ../tools). Wraps the REAL scraper:
 * when DEMO_FAULT names a fault, the FIRST call fails with a transient
 * failure of the exact shape real 503/timeout paths produce, and every later
 * call delegates to the wrapped scraper untouched. The runner — not this
 * wrapper — owns the retry decision (transient flag comes from
 * isTransientCode, the same gate the production scraper uses).
 *
 * Refuses to arm when NODE_ENV === 'production': a demo fault must never
 * reach a production scrape chain.
 *
 * Demo faults (DEMO_FAULT, read once at tool startup):
 *   http-503-once — first call: http_5xx / "HTTP 503", transient
 *   timeout-once  — first call: timeout, transient
 */
import type { ScrapeFn } from '../src/scraper/runner.js';
import {
  isTransientCode,
  type ScrapeErrorCode,
  type ScrapeFailure,
  type ScrapeInput,
  type ScrapeResult,
} from '../src/scraper/store/types.js';

export type DemoFault = 'http-503-once' | 'timeout-once';

interface FaultSpec {
  errorCode: ScrapeErrorCode;
  errorMessage: string;
}

const FAULTS: Record<DemoFault, FaultSpec> = {
  'http-503-once': {
    errorCode: 'http_5xx',
    errorMessage:
      'demo fault DEMO_FAULT=http-503-once: HTTP 503 Service Unavailable (first attempt only)',
  },
  'timeout-once': {
    errorCode: 'timeout',
    errorMessage:
      'demo fault DEMO_FAULT=timeout-once: upstream timeout after 15000ms (first attempt only)',
  },
};

/**
 * Wrap a scrape function with the armed demo fault (decided from
 * process.env.DEMO_FAULT at call time — i.e. tool startup). Unarmed,
 * unknown or production: returns the input scrape function unchanged.
 */
export function withDemoFault(scrape: ScrapeFn): ScrapeFn {
  const requested = process.env['DEMO_FAULT'];
  if (requested === undefined || requested.trim() === '') return scrape;
  const name = requested.trim();

  if (process.env['NODE_ENV'] === 'production') {
    console.error(
      `[fault-inject] refusing to arm DEMO_FAULT=${name} with NODE_ENV=production; passing through to the real scraper`,
    );
    return scrape;
  }

  const fault = FAULTS[name as DemoFault];
  if (fault === undefined) {
    console.error(
      `[fault-inject] unknown DEMO_FAULT=${JSON.stringify(name)} (expected one of: ${Object.keys(FAULTS).join(', ')}); not arming`,
    );
    return scrape;
  }
  if (!isTransientCode(fault.errorCode)) {
    // Defensive: a non-transient code would never be retried by the runner,
    // so the demonstration could not work. Fail loud instead of lying.
    throw new Error(
      `fault-inject: ${name} maps to non-transient code ${fault.errorCode}`,
    );
  }

  console.log(
    `[fault-inject] armed: first scrape call fails transiently (${fault.errorCode}), every later call uses the real scraper`,
  );
  let armed = true;
  return async (input: ScrapeInput): Promise<ScrapeResult> => {
    if (armed) {
      armed = false;
      const failure: ScrapeFailure = {
        ok: false,
        productId: input.productId,
        selectedOption: input.selectedOption,
        errorCode: fault.errorCode,
        errorMessage: fault.errorMessage,
        durationMs: 5,
        transient: isTransientCode(fault.errorCode),
      };
      return failure;
    }
    return scrape(input);
  };
}
