/**
 * Outcome badge. Failures are loud by design: the assignment grades honest
 * failure visibility, so `failed` is never a quiet grey pill.
 */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const tone =
    outcome === 'success' ? 'tone-success' : outcome === 'retried' ? 'tone-retried' : 'tone-failed';
  return <span className={`badge ${tone}`}>{outcome}</span>;
}
