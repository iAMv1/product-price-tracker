# Frontend Component Map — current → new → API contract

No backend contract was changed. All data comes from `services/api.ts`.

| Wireframe container | Implementation | Data source |
|---|---|---|
| AppShell | `components/app/AppShell.tsx` | — (health line via `fetchHealth`) |
| SiteNav | folded into AppShell + landing header | — |
| PageContainer | `max-w-6xl` column in AppShell | — |
| DashboardHeader | Dashboard title block + actions | `listTracked`, `fetchAlerts`, `fetchRuns` |
| OverviewBand/StatCard | stat tiles in `pages/Dashboard.tsx` | counts derived client-side (no fake 24h windows) |
| SignalsPanel/AlertRow | `pages/Alerts.tsx` groups | `fetchAlerts`, `fetchChangeEvents` |
| TargetsGrid/TargetCard | `TrackedProductRow.tsx` (row anatomy per spec §27) | `TrackedTarget` + `fetchHistory(id,30)` sparklines |
| TrackPanel | `pages/Search.tsx` + `hooks/useStoreSearch.ts` | `GET /api/products/search` |
| ProductHeader/OptionSelector | `pages/StoreProduct.tsx` | `GET /api/products/:id` |
| PriceHero/ProductFactBand | `pages/TrackedProduct.tsx` header + schedule card | `TrackedTarget.latest/lastScrape` |
| ProductTabs | `components/app/Tabs.tsx` (overview/history/log/settings) | — |
| PriceChart | `components/ui/sparkline.tsx` + range filter `lib/historyRange.ts` | `GET …/history?limit=200` (ranges filter loaded rows only) |
| HistoryTable | inline in TrackedProduct | history rows |
| ScrapeLogTable | `components/app/ScrapeLogTable.tsx` | `GET …/scrape-log?limit=200` |
| Modal/ConfirmDialog | `components/app/Modal.tsx`, `ConfirmDialog.tsx` | — |
| Drawer/BottomSheet | ❌ deferred (M11, AL03); mobile uses full-width Modal | — |
| ActionMenu | `components/ui/dropdown-menu.tsx` | — |
| Toast | `components/ui/toast-stack.tsx` (T01–T04) | — |
| Status system | `components/app/status.tsx` (Stock/Outcome/Alert badges) | outcome enums verbatim |
| ExportDialog | `components/app/ExportDialog.tsx` + `lib/exportCsv.ts` | server CSV (all) or locally generated per-product CSV (same schema) |
| ManualScrapeDialog | `components/app/ManualScrapeDialog.tsx` | `POST …/:id/scrape` |
| TrackingSettingsForm | `components/app/TrackingSettingsForm.tsx` | `PATCH …/:id` (interval only; alert toggles disabled — no storage API) |
| Skeletons | `skeleton-loader.tsx` + inline blocks | — (never contain digits) |
| Empty/Error/Offline/Success/NotFound | inline per container | — |

Deleted (superseded): `TargetCard.tsx`, `dashboard/{TrackPanel,TargetsGrid,OverviewBand,SignalsPanel,index}.tsx`,
`hooks/useSearchFlow.ts`, `ui/export-button.tsx` (replaced by ExportDialog).

## API contract notes (backend, unchanged)
- History/log: `?limit` only (max 200), no date ranges → ranges are client-side filters over loaded rows, captioned.
- Export: all-products only → per-product file generated locally from attempt log, same 8 columns.
- Alerts: computed reads, no storage → notification switches disabled with reason.
- Manual scrape: synchronous, no subtask progress → indeterminate dialog, no staged checklist.
- Search: text query only → filters disabled with reason; no product images/descriptions/ratings exist.
