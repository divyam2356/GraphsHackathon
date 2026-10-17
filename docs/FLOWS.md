# Flows

A. **Investigate (cause known):** accident → get_accident → prior_reports (same tail) →
   LLM keep/drop each → fleet_reports → fix_orders + explain_path → record_precursor.
   UI animates path, source on every hop.
B. **Watch (act):** newest month reports → hotspots (distinct tails vs baseline) →
   spikes matching confirmed SIGNATURE → Alert → inspection draft → create_work_order.
C. **Backtests:** see docs/EVALUATION.md.
D. **Company brain:** why_task TC-53-041 (card→fix order→SUPERSEDES chain→accident/mode);
   who_fixed S-4L; stale_tasks (cards citing replaced orders).
E. **Leads (cause unknown).** Early facts (tail, family, ATA chapter, narrative, asOf) →
   `rank_failure_modes` scores every confirmed mode known before asOf (seeds carry a sourced
   `known_from`; approval stamps it from the latest evidence date):
   family/chapter match (0.4) + signature-line overlap with this tail's priors (0.4)
   + FalkorDB full-text similarity on signature lines (0.2). No per-mode rules.
   SWA 812 replayed on 31 Mar 2011: no mode known yet → `none` (new pattern). After the
   AD (Jun 2011) the crown mode ranks first, 0.8, clear: a mechanics check, not evidence.
F. **Learn:** rank_failure_modes says none → failure_mode_candidates → add_support (a dormant
   or proposed mode fits) or propose_failure_mode (new) → approval card in the Story (Approve /
   Defer / Same as X, which moves the evidence to X / Reopen). Re-offer rule
   (`reoffer_candidates`): a mode a person deferred or reopened gets 3+ new records or a new
   NTSB event since that decision.
