import { useEffect, useId, useRef, useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { Eyebrow } from "../components/app/primitives";
import { ProductMark } from "../components/app/primitives";
import { PrimaryButton, SecondaryButton, inputClassName } from "../components/app/controls";
import { useStoreSearch } from "../hooks/useStoreSearch";
import { goHash, parseSearchQuery, productHref, searchHref, useRoute } from "../router";

/** Standalone store search. Filters stay visible but disabled: the store API supports text search only. */
export default function Search() {
  const [, , , , hash] = useRoute();
  const initialQuery = parseSearchQuery(hash);
  const search = useStoreSearch(initialQuery);
  const lastHash = useRef("");

  useEffect(() => {
    if (lastHash.current === hash) return;
    lastHash.current = hash;
    const next = parseSearchQuery(hash);
    search.setQuery(next);
    void search.runSearch(next);
    // Run only when the hash changes; the flow setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const href = searchHref(search.query);
    if (window.location.hash === href) {
      void search.runSearch(search.query);
    } else {
      goHash(href);
    }
  }

  const submitted = search.query.trim() !== "";
  const hits = search.hits;
  const listId = useId();
  // Combobox active descendant; reset whenever the result set changes.
  const [active, setActive] = useState(-1);
  useEffect(() => {
    setActive(-1);
  }, [hits]);

  // Type-ahead: the results list IS the combobox listbox — typing searches
  // live (debounced) without touching the hash, so Back still means "the
  // submitted search". One list, one keyboard contract, no duplicate UI.
  useEffect(() => {
    const term = search.query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(() => void search.runSearch(term), 350);
    return () => window.clearTimeout(timer);
    // Runs on keystrokes only; runSearch is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const options = hits ?? [];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setActive((i) => {
        const next = event.key === "ArrowDown" ? i + 1 : i - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    } else if (event.key === "Enter") {
      const hit = active >= 0 ? options[active] : undefined;
      if (hit) {
        event.preventDefault();
        goHash(productHref(hit.storeProductId));
      }
    } else if (event.key === "Escape") {
      search.cancelSearch();
    }
  }

  const activeId =
    active >= 0 && hits !== null && active < hits.length
      ? `${listId}-opt-${active}`
      : undefined;

  return (
    <AppShell
      active="search"
      crumbs={[{ label: "Dashboard", href: "#/app" }, { label: "Search" }]}
      title="Search Products"
      description="Find products from the INE mock store by partial or full name."
    >
      <div className="grid gap-6 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside aria-label="Search filters" className="h-fit rounded-2xl border border-border bg-card p-5">
          <Eyebrow>Filters</Eyebrow>
          <div className="mt-4 grid gap-4">
            <label className="block text-sm font-medium text-foreground">
              Category
              <select disabled value="all" className={`${inputClassName} mt-2`}>
                <option value="all">All categories</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-medium text-foreground">Price range</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input disabled placeholder="Min" aria-label="Minimum price" className={inputClassName} />
                <input disabled placeholder="Max" aria-label="Maximum price" className={inputClassName} />
              </div>
            </div>
            <fieldset disabled>
              <legend className="text-sm font-medium text-foreground">Availability</legend>
              <div className="mt-2 grid gap-2 text-sm text-muted">
                <label className="flex items-center gap-2">
                  <input type="radio" name="availability" defaultChecked className="size-4" /> All
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="availability" className="size-4" /> In stock
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="availability" className="size-4" /> Out of stock
                </label>
              </div>
            </fieldset>
            <p className="text-[13px] leading-relaxed text-muted">
              Category, price, and availability filters are unavailable because the store search
              API accepts text queries only.
            </p>
          </div>
        </aside>

        <section aria-label="Store results">
          <form role="search" onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="store-search">
              Search products
            </label>
            <input
              id="store-search"
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search products…"
              autoComplete="off"
              className={inputClassName}
              role="combobox"
              aria-expanded={hits !== null && hits.length > 0}
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
            />
            <div className="flex gap-2">
              <PrimaryButton type="submit" disabled={search.searching} className="sm:w-32">
                {search.searching ? "Searching…" : "Search"}
              </PrimaryButton>
              {search.searching && (
                <SecondaryButton type="button" onClick={search.cancelSearch}>
                  Cancel
                </SecondaryButton>
              )}
            </div>
          </form>

          {search.query.trim().length === 1 && (
            <p className="mt-2 text-[13px] text-muted">Enter at least 2 characters.</p>
          )}
          {hits !== null && hits.length > 0 && (
            <p className="mt-2 text-[13px] text-muted">
              Arrow keys browse, Enter opens — or click a row.
            </p>
          )}
          {search.searching && (
            <p role="status" className="mt-3 text-sm text-muted">
              Searching the store{search.elapsed >= 2 ? ` (${search.elapsed} s elapsed)` : ""}. The
              mock store is often slow.
            </p>
          )}
          {search.searchError && (
            <div role="alert" className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
              <p className="text-sm font-semibold text-danger">Search failed</p>
              <p className="mt-1 text-sm text-danger/90">{search.searchError}</p>
              <SecondaryButton className="mt-3" onClick={() => void search.runSearch(search.query)}>
                Retry
              </SecondaryButton>
            </div>
          )}
          {search.incomplete && search.hits !== null && search.hits.length > 0 && (
            <p role="status" className="mt-3 text-sm text-muted">
              Some store pages timed out — these results are partial. Search again for the missing pages.
            </p>
          )}

          {submitted && hits !== null && (
            <p className="mt-5 text-sm text-muted" role="status">
              Showing {hits.length} result{hits.length === 1 ? "" : "s"} for
              &ldquo;{search.query.trim()}&rdquo; in store order.
            </p>
          )}

          {hits !== null && hits.length === 0 && !search.searching && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="text-[17px] font-semibold text-foreground">No products found</p>
              <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted">
                Try fewer words, a partial name, or the numeric store ID.
              </p>
            </div>
          )}

          {hits !== null && hits.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Store results" className="mt-4 grid gap-3">
              {hits.map((hit, index) => (
                <li
                  key={hit.storeProductId}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === active}
                >
                  <a
                    href={productHref(hit.storeProductId)}
                    className={`flex items-center gap-4 rounded-2xl border bg-card px-4 py-3.5 outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      index === active
                        ? "border-foreground"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <ProductMark name={hit.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-foreground">
                        {hit.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted tabular-nums">
                        {[hit.brand, hit.category].filter(Boolean).join(" · ")}
                        {[hit.brand, hit.category].filter(Boolean).length > 0 ? " · " : ""}
                        ID {hit.storeProductId}
                      </span>
                      <span className="mt-1 block text-[13px] text-muted">
                        Price and stock appear after the first tracked check.
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-lg text-muted">
                      ›
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
