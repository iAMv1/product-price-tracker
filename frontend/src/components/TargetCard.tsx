import { useState } from 'react';
import {
  fetchHistory,
  fetchScrapeLog,
  rescrapeTarget,
  type AttemptEntry,
  type HistoryEntry,
  type TrackedTarget,
} from '../services/api';
import { OutcomeBadge } from './OutcomeBadge';
import { Sparkline } from './Sparkline';

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * One tracked target as an evidence card: WHAT (product + option), NOW
 * (latest validated), WHEN (last success), HEALTH (last scrape outcome),
 * TREND (history), EVIDENCE (attempt log). A failed latest scrape never
 * overwrites the displayed latest — the backend only projects validated
 * observations, and the card shows both side by side.
 */
export function TargetCard({
  target,
  onChanged,
  onUntracked,
}: {
  target: TrackedTarget;
  onChanged: () => void;
  onUntracked: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [log, setLog] = useState<AttemptEntry[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rescraping, setRescraping] = useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (!next || (history !== null && log !== null)) return;
    setDetailError(null);
    try {
      const [h, l] = await Promise.all([fetchHistory(target.id), fetchScrapeLog(target.id)]);
      setHistory(h);
      setLog(l);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function rescrape() {
    setRescraping(true);
    try {
      await rescrapeTarget(target.id);
      onChanged();
      if (expanded) {
        const [h, l] = await Promise.all([fetchHistory(target.id), fetchScrapeLog(target.id)]);
        setHistory(h);
        setLog(l);
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRescraping(false);
    }
  }

  const failed = target.lastScrape?.outcome === 'failed';
  const prices = (history ?? []).map((h) => h.price).reverse();

  return (
    <article className={`card target-card ${failed ? 'is-failed' : ''}`}>
      <header className="card-head">
        <div>
          <h3>{target.productName}</h3>
          <p className="muted">
            {target.storeProductId} · {target.selectedOption} ·{' '}
            <a href={target.productUrl} target="_blank" rel="noreferrer">
              store page
            </a>
          </p>
        </div>
        {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
      </header>

      <dl className="stat-grid">
        <div>
          <dt>Current price</dt>
          <dd className="stat-value">
            {target.latest ? `₹${target.latest.price}` : <span className="muted">no validated observation yet</span>}
          </dd>
        </div>
        <div>
          <dt>Current stock</dt>
          <dd className="stat-value">
            {target.latest ? target.latest.stock : <span className="muted">—</span>}
          </dd>
        </div>
        <div>
          <dt>Last successful scrape</dt>
          <dd>{target.latest ? formatTime(target.latest.observedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Last scrape status</dt>
          <dd>
            {target.lastScrape ? (
              <>
                {target.lastScrape.outcome} · {formatTime(target.lastScrape.attemptedAt)}
                {target.lastScrape.errorCode && (
                  <span className="muted"> · {target.lastScrape.errorCode}</span>
                )}
              </>
            ) : (
              'never scraped'
            )}
          </dd>
        </div>
      </dl>

      {failed && (
        <p className="notice notice-failed" role="alert">
          Latest scrape failed — showing the last validated observation, not fresh data.
        </p>
      )}

      {history && prices.length > 1 && <Sparkline prices={prices} />}

      <div className="card-actions">
        <button type="button" className="btn" onClick={toggle} aria-expanded={expanded}>
          {expanded ? 'Hide history & log' : 'Show history & log'}
        </button>
        <button type="button" className="btn" onClick={rescrape} disabled={rescraping}>
          {rescraping ? 'Scraping…' : 'Scrape now'}
        </button>
        <button
          type="button"
          className="btn btn-danger-ghost"
          onClick={() => onUntracked(target.id)}
        >
          Untrack
        </button>
      </div>

      {detailError && <p className="bad">{detailError}</p>}

      {expanded && (
        <div className="card-details">
          <h4>Price history</h4>
          {history === null ? (
            <p className="muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="muted">No validated observations yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Observed (local)</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.observed_at}>
                    <td>{formatTime(entry.observed_at)}</td>
                    <td className="num">₹{entry.price}</td>
                    <td>{entry.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4>Scrape log</h4>
          {log === null ? (
            <p className="muted">Loading…</p>
          ) : log.length === 0 ? (
            <p className="muted">No attempts recorded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Attempted (local)</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={`${entry.attempted_at}-${entry.attempt_number}`}>
                    <td className="num">{entry.attempt_number}</td>
                    <td>{formatTime(entry.attempted_at)}</td>
                    <td>
                      <OutcomeBadge outcome={entry.outcome} />
                    </td>
                    <td className="muted">
                      {entry.outcome === 'success'
                        ? `₹${entry.price} · ${entry.stock}`
                        : (entry.error_code ?? entry.error_message ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  );
}
