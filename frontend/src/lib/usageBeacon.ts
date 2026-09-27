import { sendUsagePing } from "../services/api";

const KEY = "ppt-usage-pinged";

/**
 * One beacon per browser session. Reasons for each guard:
 * - sessionStorage (not memory): StrictMode double-mounts and SPA remounts
 *   must not double-count a visit.
 * - Do Not Track: a telemetry feature that ignores the user's privacy
 *   signal would be slop with a tracking pixel.
 * - http(s) only: file:// previews and tests have no meaningful origin.
 * - fire-and-forget: the ping rides sendBeacon/keepalive and never blocks
 *   boot, navigation, or rendering.
 */
export function beaconDeploymentUsage(): void {
  try {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(KEY) !== null) return;
    if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
    if (!window.location.protocol.startsWith("http")) return;
    window.sessionStorage.setItem(KEY, "1");
    sendUsagePing(window.location.hash || "#/");
  } catch {
    // Telemetry must never break the app.
  }
}
