import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ManualScrapeDialog } from "./ManualScrapeDialog";

describe("ManualScrapeDialog", () => {
  it("fires exactly one scrape across parent re-renders", async () => {
    const post = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ succeeded: 1, failed: 0 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", post);
    const { rerender } = render(
      <ManualScrapeDialog
        open
        targetId="t1"
        productName="P"
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
    // A fresh inline onFinished per render (how rows call it) must not
    // re-trigger the scrape: one dialog opening bills the store once.
    rerender(
      <ManualScrapeDialog
        open
        targetId="t1"
        productName="P"
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Scrape finished/)).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(String(post.mock.calls[0]?.[0])).toContain(
      "/api/tracked-products/t1/scrape",
    );
  });
});
