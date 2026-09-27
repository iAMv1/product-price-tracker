# Frontend State Matrix

Legend: ✅ implemented · ⚠️ partial · ❌ deferred with reason.

| Surface | Loading | Empty | Success | Warning | Error | Offline/Network | Stale/Partial |
|---|---|---|---|---|---|---|---|
| Dashboard | ✅ skeletons, no digits | ✅ CTA empty state | ✅ rows + runs | ✅ failed-target banner | ✅ inline + Retry | ✅ boot error + Retry | ✅ last-validated kept, labeled |
| Search | ✅ elapsed + Cancel | ✅ guided empty | ✅ results | ✅ partial-results notice | ✅ inline + Retry | ✅ unreachable message | ✅ stale-race guard, too-short clears |
| Store product | ✅ skeleton | ✅ no-variants message | ✅ confirmation | ✅ deduped notice | ✅ preserved form + Retry | ✅ load error + back | ✅ first-scrape-pending words |
| Tracked overview | ✅ skeleton | ✅ no-observations words | ✅ stats + chart | ✅ failed banner | ✅ inline + Retry | ✅ load error + Retry | ✅ ranges over loaded rows, captioned |
| History tab | ✅ (shared load) | ✅ range-empty words | ✅ chart + table | — | ✅ | ✅ | ✅ |
| Scrape log | ✅ (shared load) | ✅ no-attempts words | ✅ full table | ✅ retried rows amber | ✅ error code+message | ✅ | ✅ failed rows empty |
| Manual scrape | ✅ indeterminate + elapsed | — | ✅ counts + toast | — | ✅ inline + Retry | ✅ message passthrough | — (single synchronous op) |
| Interval edit | ✅ saving state | — | ✅ toast | — | ✅ value preserved | ✅ | — |
| Untrack | ✅ working state | — | ✅ toast + removal | — | ✅ stays + server message | ✅ | — (no optimistic removal) |
| Export | ✅ preparing | ✅ no-rows impossible (header always) | ✅ download + message | — | ✅ message, no fake file | ✅ | ✅ per-product capped at 200, captioned |
| Alerts | ✅ loading words | ✅ explicit empty per group | ✅ grouped rows | ✅ failed-checks group | ✅ inline error | ✅ | — |
| Settings | ✅ loading words | ✅ no-targets CTA | ✅ per-row save | — | ✅ row-level error | ✅ | — |
| Toasts | — | — | ✅ T01 | ✅ T03 | ✅ T04 | ✅ | ✅ T02 info |
| 404/unknown | — | — | — | — | ✅ missing cards + back links | — | — |

Reproduction: every row is reachable in dev by stopping the backend (offline),
tracking a fresh product (pending/empty), forcing a bad interval, or removing the
network mid-request. No state requires production data to verify.
