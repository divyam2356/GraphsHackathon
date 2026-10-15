# Flows

A. **Investigate (cause known):** accident → get_accident → prior_reports (same tail) →
   LLM keep/drop each → fleet_reports → fix_orders + explain_path → record_precursor.
   UI animates path, source on every hop.
B. **Watch (act):** newest month reports → hotspots (distinct tails vs baseline) →
   spikes matching confirmed SIGNATURE → Alert → inspection draft → create_work_order.
C. **Backtests:** see docs/EVALUATION.md.
D. **Company brain:** why_task TC-53-041 (card→fix order→SUPERSEDES chain→accident/mode);
   who_fixed S-4L; stale_tasks (cards citing replaced orders).
E. **Leads (cause unknown):** early facts only → rank_failure_modes → ranked systems+locations
   with evidence paths. After cause confirmed, flow B scans fleet.
F. **Learn:** rank → Case node → decision rule → candidates via failure_mode_candidates →
   add_support (dormant/proposed fits) or propose_failure_mode (new) → approval card
   (Approve/Edit/Not now/Same as X). Dormant re-offer rule: new accident OR ≥3 new tails.
