# Frontend Wireframe Spec — frame inventory

Each frame ID maps to an implemented component/state (file in `frontend/src/`).
“Missing” marks are explicit gaps, not omissions.

## A. Landing (`pages/Landing.tsx`)
- A01_Landing_Default — centered hero, search, live proof, features, CTA ✅
- A02_Landing_Hover — hover/focus-visible on all CTAs/links ✅ (CSS states)
- A03_Landing_Mobile — stacked hero, same content, 390px ✅ (responsive)

## D. Dashboard (`pages/Dashboard.tsx`, `components/app/TrackedProductRow.tsx`)
- D01_Empty — strongest empty state, Search Products CTA ✅
- D02_Loading — stat skeleton blocks (no digits) + card skeletons ✅
- D03_Populated — stat tiles, rows, recent runs ✅
- D04_Hover — row/card hover, menu hover ✅ (CSS states)
- D05_Expanded — row ⋯ menu → View details opens full workspace ✅ (expansion lives on tracked page by design)
- D06_Failed — failed-outcome banner, last validated price kept and labeled ✅
- D07_Running / D08_Queued — runs feed statuses via OutcomeBadge ✅ (manual scrape dialog shows live run)
- D09_Abandoned — OutcomeBadge “Abandoned” ✅
- D10_Partial — success rows with `price not recorded` / `stock unknown` words ✅
- D11_API Error — inline alert + Retry, targets preserved ✅
- D12_Bulk — ❌ MISSING (deferred: no backend bulk-scrape endpoint; single-target actions only)

## S. Search (`pages/Search.tsx`, `hooks/useStoreSearch.ts`)
- S01_Idle ✅ S02_Typing ✅ (controlled input) S03_Loading ✅ (elapsed + Cancel)
- S04_Results ✅ (name, brand/category, ID, detail action; no images — API supplies none)
- S05_Partial ✅ S06_Empty ✅ S07_TooShort ✅ (inline hint, clears stale results)
- S08_Numeric ID ✅ (resolves directly) S09_URL ✅ (accepted, recognized note)
- S10_Network Error ✅ + Retry S11_Cancelled ✅ (clean idle)

## P. Product
- Store page (`pages/StoreProduct.tsx`): P01_Overview ✅ P02_OptionSelected ✅
  P03_AlreadyTracked ✅ (deduped confirmation) P04_FirstScrapePending ✅
  P05_Scraping ✅ (elapsed, no fake stages) P10_Loading ✅ P11_NotFound ✅
- Tracked page (`pages/TrackedProduct.tsx`): P06_Success ✅ (toast + refresh)
  P07_Failed ✅ (banner, last validated kept) P08_History ✅ (chart + ranges + table)
  P09_Log ✅ (UTC table + export)

## M. Modals & menus
- M01_AddProduct — ✅ via Search + StoreProduct flow (dashboard Add Product routes there)
- M02_Validation ✅ M03_TrackingSuccess ✅ M04_Duplicate ✅
- M05_ActionsMenu ✅ (View details / Run manual scrape / Edit settings / View log / Download CSV / Remove — state-valid items only)
- M06_ScrapeConfirm — ✅ implicit: the Run button + honest progress dialog (destructive? no — scrape is safe to repeat, so no blocking confirm)
- M07/M08/M09/M10 — ManualScrapeDialog phases ✅
- M11_AttemptDetails — ❌ MISSING (log Message column shows code+message inline; drawer deferred)
- M12_Settings ✅ (tab + workspace) M13_EditInterval ✅ M14_InvalidInterval ✅ (clamp + message)
  M15/M16_SaveSuccess/Failure ✅ (toast / inline, value preserved)
- M17_UntrackConfirm ✅ M18/M19 ✅ (toast / stays + server message)
- M20_Export ✅ M21_Loading ✅ M22_Success ✅ M23_Error ✅

## Alerts / errors / mobile
- AL01_Populated ✅ AL02_Empty ✅ (explicit) AL03_AlertDrawer — ❌ MISSING (rows link to tracked product instead)
- E01_Offline — ⚠️ PARTIAL (fetch failures render error states; no navigator.onLine banner yet)
- E02_APIError ✅ E03_ServerError ✅ E04_Timeout ✅ (message passthrough) E05_NotFound ✅ E06_Validation ✅
- MB01–MB12 — ✅ responsive layouts at 390px (bottom tabs; tables scroll horizontally; dialogs full-width)
- Toasts T01–T04 ✅ (`toast-stack`: success/info/warning/error, aria-live)
- Skeletons ✅ (route, cards, stats, chart area); empty states on every container ✅
