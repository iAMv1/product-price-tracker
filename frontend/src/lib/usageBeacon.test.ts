import { beforeEach, describe, expect, it, vi } from "vitest";
import { beaconDeploymentUsage } from "./usageBeacon";

const KEY = "ppt-usage-pinged";

function setDNT(value: string | undefined) {
  Object.defineProperty(window.navigator, "doNotTrack", {
    value,
    configurable: true,
  });
}

describe("beaconDeploymentUsage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setDNT(undefined);
    vi.restoreAllMocks();
  });

  it("pings once per session and then stays silent", () => {
    const ping = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", ping);
    beaconDeploymentUsage();
    beaconDeploymentUsage();
    expect(ping).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
    expect(ping.mock.calls[0]?.[0]).toContain("/api/usage-ping");
  });

  it("respects Do Not Track and never throws", () => {
    setDNT("1");
    const ping = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", ping);
    expect(() => beaconDeploymentUsage()).not.toThrow();
    expect(ping).not.toHaveBeenCalled();
  });
});
