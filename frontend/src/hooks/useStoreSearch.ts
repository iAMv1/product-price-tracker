import { useCallback, useRef, useState } from "react";
import { searchProducts, type SearchHit } from "../services/api";

/**
 * Store search without tracking state. Newest-query-wins and AbortController
 * keep slow upstream responses from overwriting newer searches.
 */
export function useStoreSearch(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const lastSearched = useRef("");
  const searchSeq = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const elapsedTimer = useRef(0);

  const stopElapsed = useCallback(() => {
    window.clearInterval(elapsedTimer.current);
    setElapsed(0);
  }, []);

  const runSearch = useCallback(
    async (raw: string) => {
      const term = raw.trim();
      if (term === "") {
        searchSeq.current += 1;
        searchAbort.current?.abort();
        searchAbort.current = null;
        stopElapsed();
        setHits(null);
        setSearchError(null);
        setIncomplete(false);
        setSearching(false);
        lastSearched.current = "";
        return;
      }
      if (term === lastSearched.current) return;
      lastSearched.current = term;
      searchSeq.current += 1;
      searchAbort.current?.abort();
      const seq = searchSeq.current;
      const controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);
      setSearchError(null);
      setIncomplete(false);
      window.clearInterval(elapsedTimer.current);
      setElapsed(0);
      elapsedTimer.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
      try {
        const { results, incomplete: partial } = await searchProducts(term, controller.signal);
        if (seq !== searchSeq.current) return;
        setHits(results);
        setIncomplete(partial);
      } catch (error) {
        if (seq !== searchSeq.current) return;
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setSearchError(error instanceof Error ? error.message : "Search failed");
        setHits(null);
        lastSearched.current = "";
      } finally {
        if (seq === searchSeq.current) {
          window.clearInterval(elapsedTimer.current);
          setElapsed(0);
          setSearching(false);
        }
      }
    },
    [stopElapsed],
  );

  const cancelSearch = useCallback(() => {
    searchSeq.current += 1;
    searchAbort.current?.abort();
    searchAbort.current = null;
    stopElapsed();
    setSearching(false);
    setSearchError(null);
    setHits(null);
    setIncomplete(false);
    lastSearched.current = "";
  }, [stopElapsed]);

  return {
    query,
    setQuery,
    hits,
    searching,
    searchError,
    incomplete,
    elapsed,
    runSearch,
    cancelSearch,
  };
}
