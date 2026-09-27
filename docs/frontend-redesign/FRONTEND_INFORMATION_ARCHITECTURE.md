# Frontend Information Architecture

Hash routing is the project constraint (`frontend/src/router.ts`). Canonical routes:

```
#/                      Landing (A01)
#/app  (alias #/dashboard)  Dashboard (D01–D12)
#/search?q=              Store search (S01–S11)
#/product/:storeId       Store product details, pre-tracking (P01–P05, P10–P11)
#/tracked/:targetId[?tab=] Tracked-product workspace: overview|history|log|settings (P06–P09)
#/alerts                 Alerts + storefront changes (AL01–AL02)
#/settings               Tracking schedules + notification availability
#/docs, #/changelog       Supporting content (unchanged)
```

Legacy `#/product/:uuid` still resolves to the tracked workspace (backward compatible).

## Global hierarchy (every page)

```
AppShell
 ├── navigation (sidebar ≥1024px / top bar + bottom tabs <1024px)
 ├── PageHeader (breadcrumb · title · description · primary actions)
 ├── Primary data
 ├── Secondary information
 └── History / log / details
```

Important data always precedes metadata. For tracked products the page order is:
product → variant → current validated price → stock → last success → last scrape →
interval → price movement → runs.
