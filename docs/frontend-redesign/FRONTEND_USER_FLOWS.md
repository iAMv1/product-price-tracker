# Frontend User Flows

## Core journey

```
LANDING ──search──▶ SEARCH ──pick──▶ SEARCH RESULTS ──select──▶ PRODUCT
   │                                                          │
   │                                                     SELECT OPTION
   │                                                          ▼
   │                                              TRACK CONFIRMATION ──duplicate──▶ VIEW TRACKED
   │                                                          │
   │                                                    TRACKING CREATED
   │                                                    FIRST SCRAPE (success | failed, both honest)
   │                                                          ▼
   └────────────────────────────────────────────────── DASHBOARD
                                                              │
                              ┌───────────┬───────────┬───────┴───────┬───────────┬───────────┐
                              ▼           ▼           ▼               ▼           ▼           ▼
                         View product  History   Scrape log    Scrape now  Edit interval  Export/Untrack
```

## Error flows (all implemented, none silent)

- `SEARCH → API ERROR → inline alert + Retry → RESULTS` (form state preserved)
- `TRACK → SERVER ERROR → form preserved, inline error → RETRY`
- `SCRAPE → RUNNING → FAIL → RETRY → SUCCESS` (ManualScrapeDialog phases)
- `SCHEDULED RUN → FAILURE → last validated data remains + alert/log rows`
- `SAVE INTERVAL → FAILURE → previous value kept, inline error`
- `UNTRACK → CONFIRM → server 403/500 → item stays, server message shown`
- `EXPORT → PREPARING → SUCCESS (download) | ERROR (message, no fake file)`

## State machines

- Search: `idle → typing → loading → results | empty | partial | error | cancelled`
- Scrape: `idle → running → completed | failed` (manual, synchronous; queued/running/abandoned visible on dashboard via runs feed)
- Tracking: `untracked → creating → tracked | error`; duplicate → confirmation with `deduped:true`
- Untrack: `tracked → confirming → untracked | error` (no optimistic removal)
- Export: `idle → preparing → success | error`
