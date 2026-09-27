import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ManualScrapeDialog } from "./ManualScrapeDialog";

describe("ManualScrapeDialog", () => {  it("fires exactly one scrape across parent re-renders", async () => {
    // Fresh Response per call: bodies are single-use, and the dialog now
    // makes two concurrent fetches (scrape + progress poll).
    const post = vi
      .fn()
      .mockImplementation(
        async () =>
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
    // Exactly one scrape POST: the progress poller reads the log but must
    // never trigger extra scrapes.
    const scrapes = post.mock.calls.filter(([url]) =>
      String(url).endsWith("/t1/scrape"),
    );
    expect(scrapes).toHaveLength(1);
    expect(String(post.mock.calls[0]?.[0])).toContain(
      "/api/tracked-products/t1/scrape",
    );
  });

  it("narrates recorded attempts while the scrape is still running", async () => {
    let resolveScrape!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveScrape = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("/scrape-log")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  attempt_number: 1,
                  attempted_at: new Date().toISOString(),
                  outcome: "retried",
                  price: null,
                  stock: null,
                  http_status: 503,
                  error_code: "http_5xx",
                  error_message: null,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return gate;
      }),
    );
    render(
      <ManualScrapeDialog
        open
        targetId="t1"
        productName="P"
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Attempt 1 recorded — retried/)).toBeInTheDocument(),
    );
    resolveScrape(
      new Response(JSON.stringify({ succeeded: 0, failed: 1 }), { status: 200 }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Scrape finished/)).toBeInTheDocument(),
    );
  });

  it("shows the stored observation while the run still finishes", async () => {
    const gate = new Promise<Response>(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("/scrape-log")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  attempt_number: 1,
                  attempted_at: new Date().toISOString(),
                  outcome: "success",
                  price: 29990,
                  stock: "3",
                  http_status: 200,
                  error_code: null,
                  error_message: null,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return gate;
      }),
    );
    render(
      <ManualScrapeDialog
        open
        targetId="t1"
        productName="P"
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
    // The value is stored but HTTP has not resolved: the dialog says what
    // is already true instead of still claiming to wait for it.
    await waitFor(() =>
      expect(screen.getByText(/Observation stored/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Finishing run/)).toBeInTheDocument();
  });
});
