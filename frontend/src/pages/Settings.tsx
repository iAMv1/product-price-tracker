import { useEffect, useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { Card, Eyebrow } from "../components/app/primitives";
import { PrimaryButton, SecondaryButton } from "../components/app/controls";
import { toast } from "../components/ui/toast-stack";
import { trackedHref } from "../router";
import {
  listTracked,
  updateInterval,
  type TrackedTarget,
} from "../services/api";

const INTERVALS = [1, 2, 6, 12, 24, 168];

/** Management workspace: real per-product schedules plus unavailable global alerts. */
export default function Settings() {
  const [targets, setTargets] = useState<TrackedTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTargets(await listTracked());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load settings");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell
      active="settings"
      title="Settings"
      description="Manage tracking schedules. Notification preferences stay unavailable until the API can store them."
    >
      {error && (
        <p role="alert" className="mb-6 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <Eyebrow>Tracking schedules</Eyebrow>
        {targets === null ? (
          <p role="status" className="mt-3 text-sm text-muted">
            Loading schedules…
          </p>
        ) : targets.length === 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">No tracked products yet.</p>
            <SecondaryButton onClick={() => (window.location.hash = "#/search")}>
              Search Products
            </SecondaryButton>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {targets.map((target) => (
              <TargetScheduleRow
                key={`${target.id}-${target.scrapeIntervalHours ?? 2}`}
                target={target}
                onSaved={() => void load()}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <Eyebrow>Notifications</Eyebrow>
        <div className="mt-3 grid gap-3">
          {[
            { title: "Price drop alerts", body: "Get notified when price decreases" },
            { title: "Back-in-stock alerts", body: "Get notified when item is back in stock" },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 opacity-80"
            >
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-[13px] text-muted">{item.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="false"
                disabled
                title="Notification preferences are unavailable"
                className="relative h-7 w-12 shrink-0 cursor-not-allowed rounded-full bg-surface"
              >
                <span aria-hidden className="absolute top-1 left-1 size-5 rounded-full bg-muted" />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">
          The API computes alerts from validated checks but does not store notification
          preferences. These switches stay off until backend support exists.
        </p>
      </Card>
    </AppShell>
  );
}

function TargetScheduleRow({
  target,
  onSaved,
}: {
  target: TrackedTarget;
  onSaved: () => void;
}) {
  const initial = target.scrapeIntervalHours ?? 2;
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = INTERVALS.includes(initial)
    ? INTERVALS
    : [initial, ...INTERVALS].sort((a, b) => a - b);

  async function save() {
    const bounded = Math.min(168, Math.max(1, Math.round(Number(hours) || 2)));
    setSaving(true);
    setError(null);
    try {
      await updateInterval(target.id, bounded);
      toast("Schedule saved", `Scraping ${target.productName} every ${bounded} h`);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid gap-3 rounded-xl border border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <a
          href={trackedHref(target.id)}
          className="block truncate text-sm font-semibold hover:text-primary"
        >
          {target.productName} · {target.selectedOption}
        </a>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="text-[13px] text-muted">
          Every{" "}
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="h-10 rounded-lg border border-border bg-card px-2 text-sm tabular-nums"
            aria-label={`Scrape interval for ${target.productName}`}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option} h
              </option>
            ))}
          </select>
        </label>
        <PrimaryButton type="submit" disabled={saving} className="min-h-10 px-4">
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </form>
    </li>
  );
}
