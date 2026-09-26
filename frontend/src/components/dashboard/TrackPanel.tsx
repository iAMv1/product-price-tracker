import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SectionTitle } from "../site-nav";
import { ExpandingSearch } from "../ui/expanding-search";
import { SegmentedControl } from "../ui/segmented-control";
import { TooltipGroup } from "../ui/tooltip-group";
import { cn } from "../../lib/cn";
import type { ProductDetail, SearchHit } from "../../services/api";

const INTERVALS = ["1", "2", "6", "12", "24"] as const;
const INTERVAL_LABEL: Record<string, string> = {
  "1": "every hour",
  "2": "every 2 hours",
  "6": "every 6 hours",
  "12": "every 12 hours",
  "24": "daily",
};

export type SearchFlow = ReturnType<
  typeof import("../../hooks/useSearchFlow").useSearchFlow
>;

/**
 * The find → pick → track panel. This is the 20% of the product that carries
 * most of the value, so it is the only thing on the page with a filled
 * primary button (Von Restorff).
 *
 * Every awkward case the user can hit has a designed answer here:
 * - a pasted URL or a bare store id is accepted the same as a name (Postel)
 * - a slow upstream search shows what it is doing, never a fake percentage
 * - the variant is pre-selected, so the common case is one click (Tesler)
 * - the interval is a constrained segmented control, so nobody parks it at a
 *   value that would make the data look fresher than it is (Parkinson)
 * - a first scrape that returns nothing is stated plainly, not glossed
 */
export function TrackPanel({ flow }: { flow: SearchFlow }) {
  const {
    query,
    setQuery,
    hits,
    searching,
    searchError,
    incomplete,
    runSearch,
    cancelSearch,
    clear,
    picked,
    pickedOption,
    setPickedOption,
    pickedMulti,
    toggleMulti,
    detailError,
    interval,
    setInterval,
    tracking,
    bulkTracking,
    trackError,
    firstScrape,
    pick,
    track,
    trackBulk,
  } = flow;

  const resultsId = useId();
  const optionsId = useId();

  // Combobox state: Arrow keys move the highlighted option, Enter picks it.
  const [active, setActive] = useState(-1);
  const options = hits === null ? [] : hits.slice(0, 6);
  useEffect(() => {
    setActive(-1);
  }, [hits]);
  const activeId =
    active >= 0 && active < options.length
      ? `${resultsId}-opt-${active}`
      : undefined;

  // Honest elapsed counter: the mock store regularly takes 5–30 s.
  // (window.* — the flow's own `setInterval` setter is destructured above.)
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!searching) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [searching]);

  // Honest first-scrape progress: elapsed seconds + the backend's real retry
  // budget ("up to 3 attempts") — no stage dots we cannot actually observe.
  const [trackElapsed, setTrackElapsed] = useState(0);
  useEffect(() => {
    if (!tracking && !bulkTracking) {
      setTrackElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setTrackElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [tracking, bulkTracking]);

  const onInputKeyDown = (ev: ReactKeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (options.length === 0) return;
      ev.preventDefault();
      setActive((i) => {
        const next = ev.key === "ArrowDown" ? i + 1 : i - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    } else if (ev.key === "Enter") {
      const hit = active >= 0 ? options[active] : undefined;
      if (hit) {
        ev.preventDefault();
        void pick(hit.storeProductId);
      }
    }
  };

  // Type-ahead: run as the user types, but only past a useful length.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      if (term === "") void runSearch("");
      return;
    }
    const timer = setTimeout(() => void runSearch(term), 260);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  return (
    <section aria-label="Find a product" className="mt-10">
      <SectionTitle>Track a price</SectionTitle>

      <TooltipGroup className="mt-4">
        <ExpandingSearch
          defaultOpen
          width={420}
          label="Product name, store ID, or link"
          placeholder="Name, store ID, or a pasted link"
          onQueryChange={setQuery}
          onSearch={(term) => void runSearch(term)}
          onInputKeyDown={onInputKeyDown}
          inputProps={{
            role: "combobox",
            "aria-expanded": options.length > 0,
            "aria-controls": resultsId,
            "aria-activedescendant": activeId,
            "aria-autocomplete": "list",
          }}
        />
      </TooltipGroup>

      <p className="mt-2 text-[13px] text-muted">
        Paste a store link, type a name, or enter the store ID. No account
        needed.
      </p>

      {searchError && (
        <p className="mt-3 text-sm text-danger" role="alert">
          We couldn&rsquo;t search just now. That&rsquo;s on our side &mdash;
          try again in a moment.
        </p>
      )}

      {searching && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted" role="status">
            Searching the store &mdash; the mock store is often slow
            {elapsed >= 2 ? ` (${elapsed} s elapsed)` : ""}. Usually 5&ndash;30 s.
          </p>
          <button
            type="button"
            onClick={cancelSearch}
            className="min-h-9 rounded-lg border border-border px-3 text-[13px] text-foreground transition-colors hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      )}

      {incomplete && hits !== null && hits.length > 0 && (
        <p className="mt-3 text-[13px] text-muted" role="status">
          Some store pages timed out &mdash; these results are partial.
          Search again to retry the missing pages.
        </p>
      )}

      {hits !== null && !searching && hits.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          Nothing matched &ldquo;{query.trim()}&rdquo;. Try fewer words, or the
          store ID if you have it.
        </p>
      )}

      {hits !== null && hits.length > 0 && (
        <ul
          id={resultsId}
          role="listbox"
          aria-label="Store results"
          className="mt-4 flex flex-col gap-2"
        >
          {options.map((hit, index) => (
            <ResultRow
              key={hit.storeProductId}
              id={`${resultsId}-opt-${index}`}
              hit={hit}
              active={index === active}
              onPick={() => void pick(hit.storeProductId)}
            />
          ))}
        </ul>
      )}

      {hits !== null && hits.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          Arrow keys browse, Enter picks &mdash; or click a row.
        </p>
      )}

      {picked !== null && (
        <ProductPicker
          product={picked}
          optionsId={optionsId}
          pickedOption={pickedOption}
          setPickedOption={setPickedOption}
          pickedMulti={pickedMulti}
          toggleMulti={toggleMulti}
          interval={interval}
          setInterval={setInterval}
          tracking={tracking}
          bulkTracking={bulkTracking}
          onTrack={() => void track()}
          onTrackBulk={() => void trackBulk()}
          elapsed={trackElapsed}
          onCancel={() => clear()}
        />
      )}

      {detailError && (
        <p className="mt-3 text-sm text-danger" role="alert">
          We couldn&rsquo;t load that product&rsquo;s options. Try again, or
          search by name instead.
        </p>
      )}

      {trackError && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {trackError}
        </p>
      )}

      {firstScrape && (
        <p
          className="mt-3 rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-muted"
          role="status"
        >
          {firstScrape}
        </p>
      )}
    </section>
  );
}

function ResultRow({
  id,
  hit,
  active,
  onPick,
}: {
  id: string;
  hit: SearchHit;
  active: boolean;
  onPick: () => void;
}) {
  // The whole row IS the option: one ≥44px pointer target, no nested button
  // fighting the listbox semantics. Arrow keys highlight it via
  // aria-activedescendant; Enter selects; click does the same.
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={cn(
        "flex min-h-11 cursor-pointer flex-wrap items-center gap-3 rounded-xl border bg-background px-4 py-3 transition-colors hover:border-foreground",
        active ? "border-foreground bg-surface" : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground">
          {hit.name}
        </p>
        <p className="font-data text-[13px] text-muted">
          {hit.brand ?? hit.category ?? "Unbranded"}
          <span aria-hidden> &middot; </span>ID {hit.storeProductId}
        </p>
      </div>
      {/* Visual affordance only — the row's click target already covers it. */}
      <span
        aria-hidden
        className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
      >
        Choose
      </span>
    </li>
  );
}

function ProductPicker({
  product,
  optionsId,
  pickedOption,
  setPickedOption,
  pickedMulti,
  toggleMulti,
  interval,
  setInterval,
  tracking,
  bulkTracking,
  onTrack,
  onTrackBulk,
  elapsed,
  onCancel,
}: {
  product: ProductDetail;
  optionsId: string;
  pickedOption: string;
  setPickedOption: (id: string) => void;
  pickedMulti: string[];
  toggleMulti: (id: string) => void;
  interval: number;
  setInterval: (hours: number) => void;
  tracking: boolean;
  bulkTracking: boolean;
  onTrack: () => void;
  onTrackBulk: () => void;
  elapsed: number;
  onCancel: () => void;
}) {
  const options = product.options;
  const busy = tracking || bulkTracking;
  const multi = pickedMulti.length > 1;

  return (
    <div className="mt-4 rounded-2xl border border-foreground bg-background p-5">
      <p className="text-[17px] font-medium text-foreground">{product.name}</p>
      <p className="font-data text-[13px] text-muted">
        {product.brand ?? product.category ?? "Unbranded"}
        <span aria-hidden> &middot; </span>ID {product.storeProductId}
      </p>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          This product has no variants listed, so there is nothing to choose.
        </p>
      ) : (
        <fieldset className="mt-4">
          <legend className="text-[13px] text-muted">
            {multi ? "Variants to track" : "Variant"}
          </legend>
          <div id={optionsId} className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => {
              const pressed = multi
                ? pickedMulti.includes(option.id)
                : pickedOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() =>
                    multi ? toggleMulti(option.id) : setPickedOption(option.id)
                  }
                  className={cn(
                    "min-h-11 rounded-lg border px-4 text-sm transition-colors",
                    pressed
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:bg-surface",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {multi && (
            <p className="mt-2 text-[13px] text-muted">
              {pickedMulti.length} selected. Up to 8 can be tracked in one go.
            </p>
          )}
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-muted">Check</span>
        <SegmentedControl
          label="How often to check this price"
          options={INTERVALS}
          value={String(interval)}
          onChange={(next) => setInterval(Number(next))}
        />
        <span className="text-[13px] text-muted">
          {INTERVAL_LABEL[String(interval)] ?? "on this schedule"}
        </span>
      </div>

      {/* The one filled button on the page. Everything else is an outline. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {multi ? (
          <button
            type="button"
            onClick={onTrackBulk}
            disabled={busy || pickedMulti.length === 0}
            className="min-h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {bulkTracking ? "Tracking…" : `Track ${pickedMulti.length} variants`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onTrack}
            disabled={busy || pickedOption === ""}
            className="min-h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {tracking ? "Tracking…" : "Track this price"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      {busy && (
        <p className="mt-3 text-[13px] text-muted" role="status">
          Checking the store for the first price &mdash; up to 3 attempts
          {elapsed >= 2 ? ` (${elapsed} s elapsed)` : ""}. The mock store is
          often slow; you can leave this open.
        </p>
      )}
    </div>
  );
}
