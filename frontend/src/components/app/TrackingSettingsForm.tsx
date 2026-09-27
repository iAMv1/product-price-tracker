import { useId, useState } from "react";
import { toast } from "../ui/toast-stack";
import { updateInterval } from "../../services/api";
import { PrimaryButton, inputClassName } from "./controls";

/**
 * Per-target tracking settings. The interval is real; notification switches
 * are visibly unavailable because the API does not store alert preferences.
 */
export function TrackingSettingsForm({
  targetId,
  productName,
  initialHours,
  onSaved,
}: {
  targetId: string;
  productName: string;
  initialHours: number;
  onSaved: () => void;
}) {
  const switchesId = useId();
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const standards = [1, 2, 6, 12, 24, 168];
  const options = standards.includes(initialHours)
    ? standards
    : [initialHours, ...standards].sort((a, b) => a - b);

  async function save() {
    const bounded = Math.min(168, Math.max(1, Math.round(Number(hours) || 2)));
    setSaving(true);
    setError(null);
    try {
      await updateInterval(targetId, bounded);
      setHours(bounded);
      toast("Schedule saved", `Scraping ${productName} every ${bounded} h`);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block max-w-xs text-sm font-semibold text-foreground">
          Scrape interval
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className={`${inputClassName} mt-2`}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                Every {option} hour{option === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </div>
      </form>

      <div aria-describedby={`${switchesId}-note`}>
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        <div className="mt-3 grid gap-3">
          {[
            {
              title: "Price drop alerts",
              body: "Get notified when price decreases",
            },
            {
              title: "Back-in-stock alerts",
              body: "Get notified when item is back in stock",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 opacity-80"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-[13px] text-muted">{item.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="false"
                disabled
                title="Notification preferences are unavailable"
                className="relative h-7 w-12 shrink-0 cursor-not-allowed rounded-full bg-surface outline-hidden"
              >
                <span aria-hidden className="absolute top-1 left-1 size-5 rounded-full bg-muted" />
              </button>
            </div>
          ))}
        </div>
        <p id={`${switchesId}-note`} className="mt-2 text-[13px] text-muted">
          Alerts are computed from validated checks, but the API does not store notification
          preferences. These switches stay off until backend support exists.
        </p>
      </div>
    </div>
  );
}
