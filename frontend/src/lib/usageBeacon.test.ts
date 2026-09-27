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
    const send = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: send,
      configurable: true,
    });
    beaconDeploymentUsage();
    beaconDeploymentUsage();
    expect(send).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
    expect(send.mock.calls[0]?.[0]).toContain("/api/usage-ping");
  });

  it("respects Do Not Track and never throws", () => {
    setDNT("1");
    const send = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: send,
      configurable: true,
    });
    expect(() => beaconDeploymentUsage()).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
