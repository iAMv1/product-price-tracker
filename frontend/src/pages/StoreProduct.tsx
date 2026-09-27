import { useEffect, useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { Card, Eyebrow, ProductMark } from "../components/app/primitives";
import { PrimaryButton, SecondaryButton } from "../components/app/controls";
import {
  fetchProduct,
  trackProduct,
  type ProductDetail,
  type TrackResult,
} from "../services/api";
import { trackedHref } from "../router";

const INTERVALS = [1, 2, 6, 12, 24, 168];

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; product: ProductDetail };

/** Store product details → option → tracking confirmation. */
export function StoreProduct({ storeId }: { storeId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [option, setOption] = useState("");
  const [interval, setInterval] = useState(2);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<TrackResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setOption("");
    setTrackError(null);
    setConfirmation(null);
    fetchProduct(storeId)
      .then((product) => {
        if (cancelled) return;
        setState({ kind: "ready", product });
        setOption(product.options[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not load this product",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function track(product: ProductDetail) {
    if (option === "" || tracking) return;
    setTracking(true);
    setTrackError(null);
    try {
      const result = await trackProduct(product.storeProductId, option, interval);
      setConfirmation(result);
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Track failed");
    } finally {
      setTracking(false);
    }
  }

  const product = state.kind === "ready" ? state.product : null;

  return (
    <AppShell
      active="search"
      crumbs={[
        { label: "Search", href: "#/search" },
        { label: product?.name ?? `Product ${storeId}` },
      ]}
      title={product?.name ?? "Product details"}
      description="See product details and available options, then track one exact option."
      actions={
        product && (
          <SecondaryButton
            onClick={() => window.open(product.productUrl, "_blank", "noreferrer")}
          >
            Store page
          </SecondaryButton>
        )
      }
    >
      {state.kind === "loading" && (
        <div role="status" className="grid gap-4">
          <div className="h-8 w-2/3 rounded bg-foreground/10 motion-safe:animate-pulse" />
          <div className="h-48 rounded-2xl bg-foreground/10 motion-safe:animate-pulse" />
          <p className="sr-only">Loading product…</p>
        </div>
      )}

      {state.kind === "error" && (
        <Card>
          <p role="alert" className="text-sm font-semibold text-danger">
            Could not load this product: {state.message}
          </p>
          <div className="mt-4">
            <SecondaryButton onClick={() => (window.location.hash = "#/search")}>
              Back to search
            </SecondaryButton>
          </div>
        </Card>
      )}

      {product && confirmation === null && (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit text-center">
            <ProductMark name={product.name} size="lg" className="mx-auto" />
            <p className="mt-4 text-[13px] text-muted">
              The store API supplies no product photo.
            </p>
            <dl className="mt-4 grid gap-2 text-left text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Product ID</dt>
                <dd className="font-medium tabular-nums">{product.storeProductId}</dd>
              </div>
              {product.brand && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Brand</dt>
                  <dd className="font-medium">{product.brand}</dd>
                </div>
              )}
              {product.category && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Category</dt>
                  <dd className="font-medium">{product.category}</dd>
                </div>
              )}
              {product.sku && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">SKU</dt>
                  <dd className="font-medium tabular-nums">{product.sku}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <Eyebrow>Available options</Eyebrow>
            {product.options.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                This product has no variants listed, so there is nothing to track.
              </p>
            ) : (
              <div role="radiogroup" aria-label={product.optionAxis ?? "Product options"} className="mt-3 grid gap-2">
                {product.options.map((item) => {
                  const selected = item.id === option;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setOption(item.id)}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4 text-sm font-medium outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground hover:border-primary/50"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span aria-hidden className="text-xs font-semibold uppercase tracking-wide opacity-70">
                        {selected ? "Selected" : product.optionAxis ?? ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[13px] text-muted">
              Prices and stock are recorded by the first check after tracking.
            </p>

            <label className="mt-5 block max-w-xs text-sm font-semibold text-foreground">
              Scrape interval
              <select
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-4 text-[15px] outline-hidden focus:border-primary"
              >
                {INTERVALS.map((hours) => (
                  <option key={hours} value={hours}>
                    Every {hours} hour{hours === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>

            {trackError && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {trackError}
              </p>
            )}
            <div className="mt-5">
              <PrimaryButton
                onClick={() => void track(product)}
                disabled={tracking || option === "" || product.options.length === 0}
              >
                {tracking ? "Tracking…" : "Track this option"}
              </PrimaryButton>
            </div>
            {tracking && (
              <p role="status" className="mt-3 text-[13px] text-muted">
                Checking the store for the first price — up to 3 attempts. The mock store is
                often slow; you can leave this open.
              </p>
            )}
          </Card>
        </div>
      )}

      {product && confirmation && (
        <Card className="mx-auto max-w-xl text-center">
          <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-success/10 text-xl text-success">
            ✓
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Product Tracked!</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">
            {confirmation.deduped
              ? "This exact option was already tracked — nothing changed."
              : confirmation.firstScrape?.outcome === "success"
                ? `We’ll check the price and stock every ${interval} hour${interval === 1 ? "" : "s"}.`
                : "The product is saved, but the first check did not return a price. The next scheduled check will try again."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="#/app"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-strong"
            >
              View on Dashboard
            </a>
            <button
              type="button"
              onClick={() => setConfirmation(null)}
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold hover:border-primary/50 hover:text-primary"
            >
              Track Another Product
            </button>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            <a href={trackedHref(confirmation.id)} className="underline underline-offset-2 hover:text-foreground">
              View this tracked product
            </a>
          </p>
        </Card>
      )}
    </AppShell>
  );
}
