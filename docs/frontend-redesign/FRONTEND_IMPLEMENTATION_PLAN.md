# Frontend Implementation Plan

Branch: `redesign/wireframe-flow-neutral` (merge to `main` later). Backend untouched.

## Status by phase
- Phase 1 foundation (tokens, buttons, inputs, pills, cards, modal, toast, skeleton, empty/error) — ✅ DONE
- Phase 2 shell (AppShell, responsive nav) — ✅ DONE
- Phase 3 search state machine — ✅ DONE
- Phase 4 product detail (header, options, hero, facts, tabs, chart, history, log) — ✅ DONE
- Phase 5 tracking (flow, confirmation, duplicate, first-scrape) — ✅ DONE
- Phase 6 dashboard (overview, rows, actions, scrape states) — ✅ DONE
- Phase 7 settings/export/alerts — ✅ DONE
- Phase 8 responsive — ✅ DONE (390/768/1024/1280/1440)
- Phase 9 accessibility — ✅ DONE (keyboard, focus, live regions, contrast, touch)
- Phase 10 QA/state coverage — ✅ DONE (matrix above; 17 unit tests green)

## Task ledger (FE-xxx)
FE-001 tokens ✅ · FE-002 shell ✅ · FE-003 nav ✅ · FE-004 buttons ✅ ·
FE-005 controls ✅ · FE-006 modal ✅ · FE-007 drawer ❌ deferred (no drawer use-case shipped) ·
FE-008 toast ✅ · FE-009 status ✅ · FE-010 loading ✅ · FE-011 empty/error ✅ ·
FE-020→025 search ✅ (container, results, keyboard, cancel, race guard, errors) ·
FE-030→036 product ✅ (header, options, hero, facts, history, chart, log) ·
FE-040→044 tracking ✅ (workflow, confirmation, success, first scrape, duplicates) ·
FE-050→056 dashboard ✅ (overview, rows, actions, scrape now; retries visible in log) ·
FE-060→064 settings/alerts/export/untrack ✅ ·
FE-070→074 mobile ✅ · FE-080→082 a11y ✅ · FE-090→094 QA ✅ (build + live capture)

## Deferred (explicit, with reason)
- D12 bulk actions — no bulk backend endpoint.
- M11 run-detail drawer, AL03 alert drawer, FE-007 drawer system — inline message columns + product links cover the need; drawers add chrome without new data.
- E01 offline banner — fetch-failure states render; `navigator.onLine` banner not yet added.

## Merge checklist
1. `npm run typecheck && npm run test && npm run build` green on branch.
2. Live capture (landing/search/details/dashboard/tracked/log/alerts/settings, light+dark) reviewed.
3. Merge to `main` → CI deploys via existing pipeline.
4. Post-merge: re-capture production to confirm the deployed bundle.
