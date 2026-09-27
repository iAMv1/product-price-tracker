# Frontend Responsive Spec

Breakpoints (Tailwind): base 390px · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.

## Navigation
- ≥1024px: fixed sidebar (248px) with section links, appearance toggle, docs links.
- <1024px: sticky top bar (logo + theme) + bottom tab bar (Dashboard/Search/Alerts/Settings, 60px targets, safe-area padding). Content gets bottom padding so tabs never cover actions.

## Transformations
| Surface | Desktop | Tablet (~768) | Mobile (390) |
|---|---|---|---|
| Dashboard rows | horizontal row: identity / price / badges / sparkline / menu | wraps to 2-line | stacked card, sparkline full-width |
| Stat tiles | 4 columns | 2 columns | 2 columns compact |
| Tracked header | price + pills inline | wraps | stacked, price first |
| History/log tables | full columns | horizontal scroll | horizontal scroll, sticky first col avoided (no fake affordance) |
| Search | filters sidebar + results | filters stack above | filters stack, action sheet patterns via full-width modal |
| Modals | centered max-w-lg | centered | near-full-screen sheet (p-4, full width) |
| Settings rows | inline form right | wraps | stacked |

## Touch/motion
- All targets ≥44px (`min-h-11`), `touch-manipulation` on pressables.
- `prefers-reduced-motion`: ticker, draws, counts, reveals collapse to opacity/none.
