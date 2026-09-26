import { useCallback, useRef, useState } from "react";
import {
  fetchProduct,
  searchProducts,
  trackByProduct,
  trackProduct,
  type ProductDetail,
  type SearchHit,
} from "../services/api";

/**
 * The find → pick → track flow, and every piece of state that goes with it.
 *
 * Nine of the Dashboard's 25 hooks lived here. The rules it enforces:
 *
 * 1. Postel's law at the input. A bare run of digits is a store id, not a
 *    search term, so it resolves directly and skips the (slow) upstream walk.
 *    Whitespace is trimmed and case is ignored before anything else happens.
 * 2. Type-ahead and Enter must not double-fetch: `lastSearched` records the
 *    last query that actually ran, so an identical Enter is a no-op.
 * 3. Options resolve on pick, so the track button is enabled with a sensible
 *    default instead of making the user choose first.
 * 4. A failed first scrape is reported. The backend's own outcome comes back
 *    in `firstScrape`, so the UI can say "tracked, but the first check did
 *    not return a price" rather than pretending it worked.
 */
export function useSearchFlow(onTracked: () => Promise<void> | void) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const lastSearched = useRef("");
  // Newest-query-wins: only the latest search may write state, so a slow
  // response can never overwrite a newer one (stale-race fix), and abort
  // discards a request the user already cancelled.
  const searchSeq = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);

  const [picked, setPicked] = useState<ProductDetail | null>(null);
  const [pickedOption, setPickedOption] = useState("");
  const [pickedMulti, setPickedMulti] = useState<string[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [interval, setInterval] = useState(2);
  const [tracking, setTracking] = useState(false);
  const [bulkTracking, setBulkTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [firstScrape, setFirstScrape] = useState<string | null>(null);

  const abortSearch = useCallback(() => {
    searchSeq.current += 1;
    searchAbort.current?.abort();
    searchAbort.current = null;
  }, []);

  const clear = useCallback(() => {
    abortSearch();
    setQuery("");
    setHits(null);
    setSearchError(null);
    setIncomplete(false);
    setPicked(null);
    setPickedOption("");
    setPickedMulti([]);
    setDetailError(null);
    setTrackError(null);
    setFirstScrape(null);
    lastSearched.current = "";
  }, [abortSearch]);

  const runSearch = useCallback(async (raw: string) => {
    const term = raw.trim();
    if (term === "") {
      abortSearch();
      setHits(null);
      setSearchError(null);
      setIncomplete(false);
      // Emptying the field also closes a product picked earlier, so
      // Cancel/erase never leaves a stale picker on screen.
      setPicked(null);
      setPickedOption("");
      setPickedMulti([]);
      setDetailError(null);
      lastSearched.current = "";
      return;
    }
    if (term === lastSearched.current) return;
    lastSearched.current = term;
    abortSearch();
    const seq = ++searchSeq.current;
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(null);
    setIncomplete(false);
    setPicked(null);
    setPickedOption("");
    setDetailError(null);
    try {
      const { results, incomplete: partial } = await searchProducts(
        term,
        controller.signal,
      );
      if (seq !== searchSeq.current) return; // a newer search owns the state
      setHits(results);
      setIncomplete(partial);
    } catch (error) {
      if (seq !== searchSeq.current) return;
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      setSearchError(
        error instanceof Error ? error.message : "Search failed",
      );
      setHits(null);
      // A failed search must be retryable with the same term.
      lastSearched.current = "";
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [abortSearch]);

  /** User pressed Cancel: drop the in-flight request and its partial state. */
  const cancelSearch = useCallback(() => {
    abortSearch();
    setSearching(false);
    setSearchError(null);
    setHits(null);
    setIncomplete(false);
    lastSearched.current = "";
  }, [abortSearch]);

  /** Fetch one product's detail and pre-select its first real option. */
  const pick = useCallback(async (storeProductId: string) => {
    setDetailError(null);
    setTrackError(null);
    setFirstScrape(null);
    try {
      const detail = await fetchProduct(storeProductId);
      setPicked(detail);
      const first = detail.options[0];
      setPickedOption(first?.id ?? "");
      setPickedMulti(first ? [first.id] : []);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }, []);

  const track = useCallback(async () => {
    if (!picked || pickedOption === "") return;
    setTracking(true);
    setTrackError(null);
    try {
      const result = await trackProduct(
        picked.storeProductId,
        pickedOption,
        interval,
      );
      // The backend scrapes once on track. If that first attempt failed, the
      // product IS tracked but has no price — say so instead of implying
      // success. `deduped` means it was already being tracked.
      setFirstScrape(
        result.deduped
          ? "Already tracked — nothing changed."
          : result.firstScrape?.outcome === "success"
            ? "Tracked. First price recorded."
            : "Tracked, but the first check did not return a price. The product is saved and the next check is scheduled.",
      );
      await onTracked();
      setPicked(null);
      setPickedOption("");
    } catch (error) {
      setTrackError(
        error instanceof Error ? error.message : "Track failed",
      );
    } finally {
      setTracking(false);
    }
  }, [picked, pickedOption, interval, onTracked]);

  /** Several variants of one product in a single run (backend caps at 8). */
  const trackBulk = useCallback(async () => {
    if (!picked || pickedMulti.length === 0) return;
    setBulkTracking(true);
    setTrackError(null);
    try {
      const result = await trackByProduct(
        picked.storeProductId,
        pickedMulti,
        interval,
      );
      setFirstScrape(
        result.failed > 0
          ? `Tracked ${pickedMulti.length} variants, but ${result.failed} first check(s) did not return a price.`
          : `Tracked ${pickedMulti.length} variants.`,
      );
      await onTracked();
      setPicked(null);
      setPickedMulti([]);
    } catch (error) {
      setTrackError(
        error instanceof Error ? error.message : "Track failed",
      );
    } finally {
      setBulkTracking(false);
    }
  }, [picked, pickedMulti, interval, onTracked]);

  const toggleMulti = useCallback((id: string) => {
    setPickedMulti((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((o) => o !== id);
      }
      // The endpoint caps a bulk track at 8 options; never send more.
      if (current.length >= 8) return current;
      return [...current, id];
    });
  }, []);

  return {
    query, setQuery, hits, searching, searchError, incomplete, runSearch,
    cancelSearch, clear,
    picked, pickedOption, setPickedOption, pickedMulti, toggleMulti,
    detailError, interval, setInterval, tracking, bulkTracking,
    trackError, firstScrape, pick, track, trackBulk,
  };
}
