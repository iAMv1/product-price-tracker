import { describe, expect, it } from 'vitest';
import { createSchemaDb } from './helpers/pgmem.js';

/**
 * DB-001 schema test. Runs db/schema.sql against pg-mem and proves the
 * load-bearing constraints:
 *  - success rows require price AND stock; non-success rows must be NULL/NULL
 *  - one history row per attempt at most (UNIQUE scrape_attempt_id)
 *  - one row per (run, product, attempt_number)
 *  - tracked identity is (store_product_id, selected_option, product_url)
 *  - the CSV export view leaves non-success rows empty by construction
 *
 * The retried-is-never-final invariant is NOT a table constraint (it spans
 * rows); the runner enforces it and SCRAPE-002 asserts it. This file proves
 * the violation is at least detectable with a plain query.
 */

function loadDb() {
  return createSchemaDb();
}

const TP = {
  id: '11111111-1111-4111-8111-111111111111',
  store_product_id: '2626',
  product_name: 'Fixture Product',
  selected_option: 'o1',
  product_url: 'https://demo.inelabteamdev.com/item/2626',
};

const RUN = {
  id: '22222222-2222-4222-8222-222222222222',
};

describe('db/schema.sql (DB-001)', () => {
  it('persists tracked products and enforces the product+option+url identity', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.id}', '${TP.store_product_id}', '${TP.product_name}', '${TP.selected_option}', '${TP.product_url}')`,
    );
    // Same product + same option + same URL twice is a duplicate intent.
    expect(() =>
      db.public.none(
        `INSERT INTO tracked_products (store_product_id, product_name, selected_option, product_url)
         VALUES ('${TP.store_product_id}', 'Other Name', '${TP.selected_option}', '${TP.product_url}')`,
      ),
    ).toThrow();
    // Same product with a DIFFERENT option is a different target and must pass.
    db.public.none(
      `INSERT INTO tracked_products (store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.store_product_id}', '${TP.product_name}', 'o2', '${TP.product_url}')`,
    );
    expect(db.public.many(`SELECT id FROM tracked_products`).length).toBe(2);
  });

  it('persists scrape runs with a bounded trigger vocabulary', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO scrape_runs (id, trigger_type, status, target_count)
       VALUES ('${RUN.id}', 'scheduled', 'running', 3)`,
    );
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_runs (trigger_type) VALUES ('in-process-timer')`,
      ),
    ).toThrow();
  });

  it('stores every attempt as its own row and enforces the success-only CHECK', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.id}', '${TP.store_product_id}', '${TP.product_name}', '${TP.selected_option}', '${TP.product_url}')`,
    );
    db.public.none(
      `INSERT INTO scrape_runs (id, trigger_type) VALUES ('${RUN.id}', 'manual')`,
    );

    // Retry chain: retried, retried, success — one row per network attempt.
    // (Explicit ids: pg-mem evaluates the gen_random_uuid() default once per
    // prepared shape and would otherwise collide PKs — a test-harness quirk,
    // not a schema defect. Supabase generates fresh values per row.)
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, error_code)
       VALUES ('a1a1a1a1-1111-4111-8111-111111111111', '${RUN.id}', '${TP.id}', 1, 'retried', 'timeout')`,
    );
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, error_code, http_status)
       VALUES ('a2a2a2a2-2222-4222-8222-222222222222', '${RUN.id}', '${TP.id}', 2, 'retried', 'http_503', 503)`,
    );
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
       VALUES ('a3a3a3a3-3333-4333-8333-333333333333', '${RUN.id}', '${TP.id}', 3, 'success', 47052, '0')`,
    );
    expect(
      db.public.many(
        `SELECT attempt_number FROM scrape_attempts ORDER BY attempt_number`,
      ).length,
    ).toBe(3);

    // Duplicate (run, product, attempt_number) is rejected.
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, error_code)
         VALUES ('${RUN.id}', '${TP.id}', 3, 'failed', 'duplicate')`,
      ),
    ).toThrow();

    // A success row missing either value is rejected.
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
         VALUES ('${RUN.id}', '${TP.id}', 4, 'success', NULL, '0')`,
      ),
    ).toThrow();
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
         VALUES ('${RUN.id}', '${TP.id}', 4, 'success', 47052, NULL)`,
      ),
    ).toThrow();

    // A non-success row carrying EITHER value is rejected — this is the
    // stronger rule DEC-0003 requires (the CSV "failed rows are empty"
    // requirement is a special case of it).
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
         VALUES ('${RUN.id}', '${TP.id}', 4, 'failed', 47052, NULL)`,
      ),
    ).toThrow();
    expect(() =>
      db.public.none(
        `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
         VALUES ('${RUN.id}', '${TP.id}', 4, 'retried', NULL, '0')`,
      ),
    ).toThrow();
  });

  it('keeps history to validated observations: one row per attempt, values required', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.id}', '${TP.store_product_id}', '${TP.product_name}', '${TP.selected_option}', '${TP.product_url}')`,
    );
    db.public.none(
      `INSERT INTO scrape_runs (id, trigger_type) VALUES ('${RUN.id}', 'manual')`,
    );
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
       VALUES ('33333333-3333-4333-8333-333333333333', '${RUN.id}', '${TP.id}', 1, 'success', 47052, '0')`,
    );

    db.public.none(
      `INSERT INTO price_stock_history (scrape_attempt_id, tracked_product_id, price, stock)
       VALUES ('33333333-3333-4333-8333-333333333333', '${TP.id}', 47052, '0')`,
    );
    // A second history row for the same attempt is padding — rejected.
    expect(() =>
      db.public.none(
        `INSERT INTO price_stock_history (scrape_attempt_id, tracked_product_id, price, stock)
         VALUES ('33333333-3333-4333-8333-333333333333', '${TP.id}', 47051, '0')`,
      ),
    ).toThrow();
    // History rows with non-positive prices are rejected.
    expect(() =>
      db.public.none(
        `INSERT INTO price_stock_history (scrape_attempt_id, tracked_product_id, price, stock)
         VALUES ('44444444-4444-4444-8444-444444444444', '${TP.id}', 0, '0')`,
      ),
    ).toThrow();
  });

  it('exposes the CSV export as a join that leaves non-success rows empty', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.id}', '${TP.store_product_id}', '${TP.product_name}', '${TP.selected_option}', '${TP.product_url}')`,
    );
    db.public.none(
      `INSERT INTO scrape_runs (id, trigger_type) VALUES ('${RUN.id}', 'manual')`,
    );
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, error_code)
       VALUES ('55555555-5555-4555-8555-555555555555', '${RUN.id}', '${TP.id}', 1, 'retried', 'timeout')`,
    );
    db.public.none(
      `INSERT INTO scrape_attempts (id, scrape_run_id, tracked_product_id, attempt_number, outcome, price, stock)
       VALUES ('66666666-6666-4666-8666-666666666666', '${RUN.id}', '${TP.id}', 2, 'success', 47052, '0')`,
    );
    db.public.none(
      `INSERT INTO price_stock_history (scrape_attempt_id, tracked_product_id, price, stock)
       VALUES ('66666666-6666-4666-8666-666666666666', '${TP.id}', 47052, '0')`,
    );

    const rows = db.public.many(
      `SELECT product_id, outcome, price, stock, attempt_number
       FROM v_scrape_attempt_export ORDER BY attempt_number`,
    ) as Array<{
      product_id: string;
      outcome: string;
      price: string | null;
      stock: string | null;
      attempt_number: number;
    }>;
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      product_id: '2626',
      outcome: 'retried',
      price: null,
      stock: null,
      attempt_number: 1,
    });
    expect(rows[1]).toMatchObject({
      product_id: '2626',
      outcome: 'success',
      attempt_number: 2,
    });
    expect(rows[1]?.price).not.toBeNull();
    expect(rows[1]?.stock).not.toBeNull();

    // Latest-validated projection answers NOW/WHEN without touching failures.
    const latest = db.public.one(
      `SELECT price, stock FROM v_latest_validated WHERE tracked_product_id = '${TP.id}'`,
    ) as { price: string; stock: string };
    expect(latest.stock).toBe('0');
  });

  it('documents the retried-is-never-final detector the runner must satisfy', () => {
    const db = loadDb();
    db.public.none(
      `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
       VALUES ('${TP.id}', '${TP.store_product_id}', '${TP.product_name}', '${TP.selected_option}', '${TP.product_url}')`,
    );
    db.public.none(
      `INSERT INTO scrape_runs (id, trigger_type) VALUES ('${RUN.id}', 'manual')`,
    );
    // A retried row with NO follower: the interrupted-loop bug, not an outcome.
    db.public.none(
      `INSERT INTO scrape_attempts (scrape_run_id, tracked_product_id, attempt_number, outcome, error_code)
       VALUES ('${RUN.id}', '${TP.id}', 1, 'retried', 'timeout')`,
    );
    const dangling = db.public.many(
      // Anti-join form (no correlated subquery): the exact detector the
      // SCRAPE-002 runner test will reuse. A row here means the retry loop
      // was interrupted — a bug, not an outcome.
      `SELECT r.id FROM scrape_attempts r
       LEFT JOIN scrape_attempts later
         ON later.scrape_run_id = r.scrape_run_id
        AND later.tracked_product_id = r.tracked_product_id
        AND later.attempt_number > r.attempt_number
       WHERE r.outcome = 'retried' AND later.id IS NULL`,
    );
    expect(dangling.length).toBe(1);
  });
});
