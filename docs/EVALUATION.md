# Evaluation

The evaluation is `services/eval/src/backtest.ts`. Results and the reading of them are in the
README ("Does it generalise?"); the saved run the Story shows is `apps/web/public/backtest.json`.

```bash
npm run backtest -w services/eval -- --days=365 --gap=7 [--shuffles=1000] [--out=file.json]
```

**Question:** before each NTSB mechanical event, did the aircraft's own FAA reports (in the
window, at least `--gap` days before) name a system the NTSB later cited?

- Match levels: system = ATA chapter (NTSB finding code digits 5–6); subsystem = ATA section
  (digits 5–7 against the report's JASC code), only where the NTSB coded below "(general)".
- Chance: permutation test, cited systems shuffled across events (seed 42), so each aircraft keeps
  its own reports. Three stages close one leak each: naive → gap (drops the event's own report) →
  same-family shuffle (drops family habits; families with 2+ events).
- `detectable_lift` = 95th percentile of the null / its mean: the smallest lift the test would catch.

**Not tested, and why**
- Location-level matching (the Southwest 812 signal): NTSB findings in the public database carry
  no stringer or station, so there is nothing to match at that level across events.
- Fleet-level rises before events in other families: the graph holds every 737 structures report
  but, for other families, only reports on aircraft that had an NTSB event.
- Leads ranking and novelty detection (the original plan): 3 hand-seeded failure modes, too few to
  evaluate. `services/eval/src/all.ts` keeps them as SWA 812 regression checks only.
