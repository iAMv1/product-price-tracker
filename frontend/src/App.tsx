import { useCallback, useEffect, useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { TargetCard } from './components/TargetCard';
import { ThemeToggle } from './components/ThemeToggle';
import {
  ApiError,
  exportCsvUrl,
  fetchHealth,
  fetchProduct,
  listTracked,
  searchProducts,
  trackProduct,
  type HealthResponse,
  type ProductDetail,
  type SearchHit,
  type TrackedTarget,
} from './services/api';

type BootState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; message: string };

export default function App() {
  const [boot, setBoot] = useState<BootState>({ kind: 'loading' });
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [picked, setPicked] = useState<ProductDetail | null>(null);
  const [pickedOption, setPickedOption] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshTargets = useCallback(async () => {
    try {
      setTargets(await listTracked());
      setTargetsError(null);
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHealth(), listTracked()])
      .then(([health, list]) => {
        if (cancelled) return;
        setBoot({ kind: 'ready', health });
        setTargets(list);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 503) {
          // Backend is up but the database is not wired yet — the catalogue
          // still works, so boot read-only instead of failing outright.
          fetchHealth()
            .then((health) => {
              if (!cancelled) setBoot({ kind: 'ready', health });
            })
            .catch(() => {
              if (!cancelled) {
                setBoot({
                  kind: 'error',
                  message: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            });
          setTargetsError(error.message);
          return;
        }
        setBoot({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runSearch(q: string) {
    setQuery(q);
    setPicked(null);
    if (q.trim() === '') {
      setHits(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await searchProducts(q));
    } catch (error) {
      setHits(null);
      setSearchError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSearching(false);
    }
  }

  async function pickProduct(hit: SearchHit) {
    setDetailError(null);
    setPickedOption('');
    try {
      const detail = await fetchProduct(hit.storeProductId);
      setPicked(detail);
      setPickedOption(detail.options[0]?.id ?? '');
    } catch (error) {
      setPicked(null);
      setDetailError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function track() {
    if (picked === null || pickedOption === '') return;
    setTracking(true);
    setTrackError(null);
    setNotice(null);
    try {
      const result = await trackProduct(picked.storeProductId, pickedOption);
      setNotice(
        result.deduped
          ? `Already tracking ${result.productName} (${result.selectedOption}).`
          : result.firstScrape?.outcome === 'success'
            ? `Tracking ${result.productName} (${result.selectedOption}) — first scrape succeeded.`
            : `Tracking ${result.productName} (${result.selectedOption}) — first scrape failed and is logged honestly.`,
      );
      setPicked(null);
      setHits(null);
      await refreshTargets();
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setTracking(false);
    }
  }

  async function untrack(id: string) {
    const target = targets.find((t) => t.id === id);
    if (
      target === undefined ||
      !window.confirm(`Stop tracking ${target.productName} (${target.selectedOption})? Its history is deleted.`)
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/tracked-products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`untrack failed with HTTP ${response.status}`);
      await refreshTargets();
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  const dbDown =
    boot.kind === 'ready' && !boot.health.integrations.database
      ? 'Database not configured — tracking is disabled, catalogue search still works.'
      : null;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Product Price Tracker</h1>
          <p className="subtitle">Validated observations only. Failures stay visible.</p>
        </div>
        <div className="topbar-actions">
          <a className="btn" href={exportCsvUrl()} download>
            Export CSV
          </a>
          <ThemeToggle />
        </div>
      </header>

      {boot.kind === 'loading' && <p>Contacting backend…</p>}
      {boot.kind === 'error' && (
        <p className="bad" role="alert">
          Backend unreachable: {boot.message}. Start it with <code>npm run dev:backend</code>.
        </p>
      )}

      {boot.kind === 'ready' && (
        <>
          {dbDown && (
            <p className="notice" role="status">
              {dbDown}
            </p>
          )}
          {notice && (
            <p className="notice notice-good" role="status">
              {notice}
            </p>
          )}

          <section aria-label="Search and track">
            <SearchBar
              onSearch={runSearch}
              searching={searching}
              resultCount={hits === null ? targets.length : hits.length}
              hasQuery={query.trim() !== ''}
            />
            {searchError && <p className="bad">{searchError}</p>}
            {hits !== null && (
              <ul className="hit-list">
                {hits.map((hit) => (
                  <li key={hit.storeProductId}>
                    <button type="button" className="hit" onClick={() => pickProduct(hit)}>
                      <span className="hit-name">{hit.name}</span>
                      <span className="muted">
                        {hit.storeProductId}
                        {hit.brand ? ` · ${hit.brand}` : ''}
                        {hit.category ? ` · ${hit.category}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
                {hits.length === 0 && <li className="muted">No products match “{query}”.</li>}
              </ul>
            )}

            {detailError && <p className="bad">{detailError}</p>}
            {picked !== null && (
              <div className="card pick-card">
                <h3>{picked.name}</h3>
                <p className="muted">
                  {picked.storeProductId}
                  {picked.optionAxis ? ` · options: ${picked.optionAxis}` : ''}
                </p>
                <label className="option-label">
                  Option to track
                  <select
                    value={pickedOption}
                    onChange={(event) => setPickedOption(event.target.value)}
                  >
                    {picked.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.id} — {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={track}
                    disabled={tracking || pickedOption === ''}
                  >
                    {tracking ? 'Tracking…' : 'Track this option'}
                  </button>
                  <button type="button" className="btn" onClick={() => setPicked(null)}>
                    Cancel
                  </button>
                </div>
                {trackError && <p className="bad">{trackError}</p>}
              </div>
            )}
          </section>

          <section aria-label="Tracked products">
            <h2>Tracked</h2>
            {targetsError && <p className="bad">{targetsError}</p>}
            {targets.length === 0 && targetsError === null && (
              <p className="muted">Nothing tracked yet — search above to add the first target.</p>
            )}
            <div className="card-grid">
              {targets.map((target) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  onChanged={refreshTargets}
                  onUntracked={untrack}
                />
              ))}
            </div>
          </section>

          <footer className="muted foot">
            <span>
              Backend {boot.health.environment} · DB{' '}
              {boot.health.integrations.database ? 'connected' : 'not configured'} · scrapes every
              2 hours via external cron
            </span>
          </footer>
        </>
      )}
    </main>
  );
}
