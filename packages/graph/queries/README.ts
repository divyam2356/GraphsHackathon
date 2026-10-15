// Canonical queries — MCP server imports these, agent NEVER writes raw Cypher.
// Every read takes asOf (time machine). $asOf = ISO date string.

// --- prior_reports: same tail + location bin, before asOf ---
// MATCH (r:Report)-[:ON]->(t:Aircraft {tail:$tail}),
//       (r)-[:AT]->(l:Location {bin:$bin})
// WHERE r.date < $asOf AND r.date >= date($asOf)-duration({days:$window})
// RETURN r ORDER BY r.date DESC

// --- fleet_reports: same family + location bin, window ---
// MATCH (r:Report)-[:ON]->(:Aircraft)-[:IS_A]->(:Model {family:$family}),
//       (r)-[:AT]->(l:Location) WHERE l.bin=$bin AND $from<=r.date<=$to
// RETURN l.bin, count(DISTINCT r) AS reports, count(DISTINCT tail) AS aircraft

// --- hotspots: distinct tails per location vs baseline (plain counting first;
//     labelPropagation variant in jobs/hotspots.cypher builds :CO_<window> edges) ---
// MATCH (r:Report)-[:ON]->(a:Aircraft)-[:IS_A]->(:Model {family:$family}),
//       (r)-[:AT]->(l:Location) WHERE r.date < $asOf
// WITH l, count(DISTINCT a.tail) AS ac ORDER BY ac DESC LIMIT 25 RETURN l, ac

// --- explain_path: fix order → accident connection ---
// CALL algo.SPpaths({source:$a, target:$b, relTypes:['APPLIES_TO','TARGETS','AT','FOUND','PRECURSOR_OF']})

// --- rank_failure_modes: scoring happens in TS (packages/agent/src/scoring.ts);
//     Cypher only fetches candidate evidence paths per confirmed mode.
export const QUERIES = {
  prior_reports: "prior_reports.cypher",
  fleet_reports: "fleet_reports.cypher",
  hotspots: "hotspots.cypher",
  explain_path: "CALL algo.SPpaths",
  rank: "rank_candidates.cypher",
};
