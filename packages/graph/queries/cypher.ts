// Fixed Cypher per tool — agent NEVER writes raw Cypher. Verified against
// docs.falkordb.com (Oct 2026): fulltext procs, vector procs + vecf32,
// algo.SPpaths({sourceNode, targetNode...}), algo.labelPropagation,
// algo.pageRank(label, relType). $asOf time-machine cutoff on every read.
// Dates are ISO strings. Locations nest bin -> line -> zone via WITHIN, so
// `(r)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})` rolls a report up
// to any level ("737/53/S4L" = stringer 4 left on the 737 fuselage). Absent optional
// params arrive as null (db.ts withNulls).
/** Every (from, type, to) edge in the graph model, for edge_stats. */
const SCHEMA_EDGES: Array<[string, string, string]> = [
  ["Report", "AT", "Location"], ["Report", "ON", "Aircraft"], ["Aircraft", "IS_A", "Model"],
  ["Accident", "INVOLVED", "Aircraft"], ["Accident", "FOUND", "Finding"], ["Finding", "AT", "Location"],
  ["Finding", "IN_SYSTEM", "System"], ["Location", "WITHIN", "Location"], ["Location", "IN_SYSTEM", "System"],
  ["Location", "FOR", "Model"], ["FixOrder", "TARGETS", "Location"], ["FixOrder", "APPLIES_TO", "Model"],
  ["FixOrder", "SUPERSEDES", "FixOrder"], ["FailureMode", "SIGNATURE", "Location"], ["FailureMode", "FOR", "Model"],
  ["Report", "EVIDENCE_FOR", "FailureMode"], ["Accident", "EVIDENCE_FOR", "FailureMode"], ["Report", "PRECURSOR_OF", "Accident"],
  ["FailureMode", "MERGED_INTO", "FailureMode"],
  ["Engineer", "MEMBER_OF", "Team"], ["TaskCard", "CITES", "FixOrder"], ["Decision", "BASED_ON", "FixOrder"],
];

export const CYPHER: Record<string, string> = {
  search_accidents: `
    CALL db.idx.fulltext.queryNodes('Accident', $text) YIELD node AS a, score
    WHERE $asOf IS NULL OR a.date < $asOf
    OPTIONAL MATCH (a)-[:FOUND]->(f:Finding)
    RETURN a.ev_id AS ev_id, a.ntsb_no AS ntsb_no, a.date AS date, collect(f.text) AS findings,
      substring(a.cause_text, 0, 300) AS cause, score
    ORDER BY score DESC LIMIT 25`,
  get_accident: `
    MATCH (a:Accident {ev_id:$ev_id})-[i:INVOLVED]->(t:Aircraft)-[:IS_A]->(m:Model)
    OPTIONAL MATCH (a)-[fo:FOUND]->(f:Finding)-[:AT]->(l:Location)
    RETURN a.ev_id AS ev_id, a.ntsb_no AS ntsb_no, a.date AS date, t.tail AS tail, t.id AS aircraft,
      t.variant AS variant, m.family AS family, i.far_part AS far_part, a.cause_text AS cause,
      collect({finding:f.text, kind:fo.kind, chapter:f.chapter, at:l.bin}) AS findings`,
  prior_reports: `
    MATCH (:Aircraft {tail:$tail})<-[:ON]-(r:Report)-[:AT]->(l:Location)
    WHERE r.date < $asOf
      AND r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 730)}))
      AND ($bin IS NULL OR (l)-[:WITHIN*0..2]->(:Location {bin:$bin}))
    RETURN r.id AS id, r.date AS date, r.text AS text, l.bin AS bin, r.part AS part, r.condition AS condition
    ORDER BY r.date DESC LIMIT 50`,
  fleet_reports: `
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})
    WHERE $from <= r.date < $to
    MATCH (r)-[:ON]->(ac:Aircraft)
    RETURN count(r) AS reports, count(DISTINCT ac) AS aircraft, collect(DISTINCT ac.variant) AS variants,
      min(r.date) AS first, max(r.date) AS last`,
  hotspots: `
    // Rising lines: distinct aircraft reporting in the last window vs the window before.
    // Raw counts favour busy lines (routine clip/frame findings); filter part='SKIN',
    // condition='CRACK' to rank damage that matters. Backtest: on 2011-01-01 this put
    // 737/53/S4L 2nd by lift (17 vs 7 aircraft), 3 months before SWA 812.
    MATCH (line:Location {level:'line', family:$family})
    WHERE $chapter IS NULL OR line.chapter = $chapter
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE r.date < $asOf AND r.date >= toString(date($asOf) - duration({days: 2 * coalesce($windowDays, 365)}))
      AND ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
    MATCH (r)-[:ON]->(a:Aircraft)
    WITH line, a, r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 365)})) AS recent
    WITH line, count(DISTINCT CASE WHEN recent THEN a END) AS ac, count(DISTINCT CASE WHEN NOT recent THEN a END) AS ac_prev
    WHERE ac >= coalesce($minAircraft, 5)
    RETURN line.bin AS bin, ac, ac_prev, round(100.0 * (ac + 1) / (ac_prev + 1)) / 100 AS lift
    ORDER BY lift DESC, ac DESC LIMIT 25`,
  // Keyword similarity (full-text index) until real embeddings are loaded; then swap to
  // CALL db.idx.vector.queryNodes('Report', 'embedding', $k, vecf32($vec)).
  similar_reports: `
    CALL db.idx.fulltext.queryNodes('Report', $text) YIELD node AS r, score
    WHERE $asOf IS NULL OR r.date < $asOf
    MATCH (r)-[:ON]->(a:Aircraft), (r)-[:AT]->(l:Location)
    RETURN r.id AS id, r.date AS date, r.text AS text, a.tail AS tail, a.variant AS variant, l.bin AS bin, score
    ORDER BY score DESC LIMIT 25`,
  fix_orders: `
    MATCH (f:FixOrder)-[:APPLIES_TO]->(:Model {family:$family})
    WHERE $asOf IS NULL OR f.date <= $asOf
    OPTIONAL MATCH (f)-[:TARGETS]->(l:Location)
    OPTIONAL MATCH (f)-[:SUPERSEDES*1..5]->(old:FixOrder)
    RETURN f.ad_no AS ad, f.date AS date, l.bin AS bin, collect(DISTINCT old.ad_no) AS replaces`,
  explain_path: `
    // Endpoints by indexed key (an unlabelled OR scan of 250k nodes cost ~80 ms).
    CALL { MATCH (x:Report {id:$from}) RETURN x UNION MATCH (x:Accident {ev_id:$from}) RETURN x
      UNION MATCH (x:FixOrder {ad_no:$from}) RETURN x UNION MATCH (x:Location {bin:$from}) RETURN x } WITH x AS a
    CALL { MATCH (x:Report {id:$to}) RETURN x UNION MATCH (x:Accident {ev_id:$to}) RETURN x
      UNION MATCH (x:FixOrder {ad_no:$to}) RETURN x UNION MATCH (x:Location {bin:$to}) RETURN x } WITH a, x AS b
    // Search from the end with fewer edges: event -> stringer line takes 1 ms, line -> event 650 ms.
    OPTIONAL MATCH (a)-[ea]-() WITH a, b, count(ea) AS da
    OPTIONAL MATCH (b)-[eb]-() WITH a, b, da, count(eb) AS db
    WITH da <= db AS fwd, CASE WHEN da <= db THEN a ELSE b END AS s, CASE WHEN da <= db THEN b ELSE a END AS t
    // Evidence edges only, maxLen 4 (every evidence path we use is <= 4 hops). FalkorDB's
    // shortestPath() is directed-only and these paths mix directions, so SPpaths with
    // relDirection 'both'; maxLen 5+ explodes through hub nodes (6 s vs 10-130 ms at 4).
    // Time machine: all shortest paths (pathCount 0), keeping the first whose records between
    // the endpoints are all dated before asOf (same cost: 3-180 ms). No row = no such path.
    CALL algo.SPpaths({sourceNode:s, targetNode:t, relDirection:'both', maxLen:4, pathCount:0,
      relTypes:['ON','INVOLVED','AT','WITHIN','FOUND','PRECURSOR_OF','TARGETS','SUPERSEDES','CITES','MATCHES','SIGNATURE']}) YIELD path
    WITH fwd, path WHERE $asOf IS NULL OR all(n IN nodes(path)[1..-1] WHERE n.date IS NULL OR n.date < $asOf)
    WITH fwd, path LIMIT 1
    WITH fwd, nodes(path) AS ns, [r IN relationships(path) | type(r)] AS rs
    RETURN [n IN CASE WHEN fwd THEN ns ELSE reverse(ns) END | {labels:labels(n), id:coalesce(n.id, n.ev_id, n.ad_no, n.bin)}] AS hops,
      CASE WHEN fwd THEN rs ELSE reverse(rs) END AS rels`,
  // Only modes known before the investigation date: seeds carry a sourced known_from,
  // approval stamps it from the evidence. No known_from, never ranked (no hindsight).
  rank_failure_modes: `
    MATCH (m:FailureMode) WHERE m.status = 'confirmed' AND m.known_from < $asOf
    OPTIONAL MATCH (m)-[s:SIGNATURE]->(l:Location)
    OPTIONAL MATCH (m)-[:FOR]->(mo:Model)
    RETURN m.id AS id, m.name AS name, m.system AS system,
      collect({bin:l.bin, w:s.weight}) AS sig, mo.family AS family`,
  failure_mode_candidates: `
    MATCH (m:FailureMode) WHERE m.status IN ['dormant','proposed']
    RETURN m.id AS id, m.name AS name, m.status AS status, m.decision_reason AS reason`,
  record_precursor: `
    MATCH (r:Report {id:$reportId}), (a:Accident {ev_id:$accidentId})
    MERGE (r)-[p:PRECURSOR_OF]->(a)
    SET p.confidence=$confidence, p.reason=$reason, p.asOf=$asOf RETURN p.confidence AS ok`,
  raise_alert: `
    MATCH (t:Aircraft {tail:$tail})
    CREATE (al:Alert {id:randomUUID(), date:toString(date()), status:'open', reason:$reason})-[:FOR]->(t)
    WITH al OPTIONAL MATCH (m:FailureMode {id:$modeId})
    FOREACH (_ IN CASE WHEN m IS NULL THEN [] ELSE [1] END | CREATE (al)-[:MATCHES]->(m))
    RETURN al.id AS id`,
  // MERGE by name: proposing the same mode twice adds evidence instead of a duplicate.
  // Evidence (report ids / ev_ids) is linked EVIDENCE_FOR. A person decides in the UI (decide_mode).
  propose_failure_mode: `
    MERGE (m:FailureMode {name:$draft.name})
      ON CREATE SET m.id = randomUUID(), m.system = $draft.system, m.mechanism = $draft.mechanism,
        m.status = 'proposed', m.origin = 'accident', m.proposed_at = toString(date()), m.support_at_decision = 0
    WITH m
    OPTIONAL MATCH (r:Report) WHERE r.id IN coalesce($evidence, [])
    WITH m, collect(r) AS rs
    OPTIONAL MATCH (a:Accident) WHERE a.ev_id IN coalesce($evidence, [])
    WITH m, rs, collect(a) AS acc
    FOREACH (x IN rs + acc | MERGE (x)-[:EVIDENCE_FOR]->(m))
    RETURN m.id AS id, m.name AS name, m.status AS status, size(rs) + size(acc) AS linked`,
  add_support: `
    MATCH (c:Case {id:$caseId}), (m:FailureMode {id:$modeId})
    MERGE (c)-[:SUPPORTS]->(m) RETURN c.id AS ok`,
  record_observation: `
    MATCH (t:Aircraft {tail:$tail}), (l:Location {bin:$bin})
    CREATE (o:Observation {id:randomUUID(), text:$text, date:$date})-[:ON]->(t)
    CREATE (o)-[:AT]->(l) RETURN o.id AS id`,
  // One engineer per work order (least loaded on the team), placed at $bin or else at the
  // matched failure mode's strongest signature location, so who_fixed can find it.
  create_work_order: `
    MATCH (al:Alert {id:$alertId})-[:FOR]->(t:Aircraft)
    OPTIONAL MATCH (al)-[:MATCHES]->(:FailureMode)-[s:SIGNATURE]->(ml:Location)
    WITH al, t, ml ORDER BY s.weight DESC LIMIT 1
    OPTIONAL MATCH (bl:Location {bin:$bin})
    WITH al, t, coalesce(bl, ml) AS l
    MATCH (e:Engineer)-[:MEMBER_OF]->(:Team {name:$team})
    OPTIONAL MATCH (e)-[:SIGNED_OFF]->(prev:WorkOrder)
    WITH al, t, l, e, count(prev) AS load ORDER BY load ASC LIMIT 1
    CREATE (w:WorkOrder {id:randomUUID(), team:$team, date:toString(date()), synthetic:true})-[:ON]->(t)
    CREATE (e)-[:SIGNED_OFF]->(w)
    CREATE (w)-[:FROM]->(al)
    FOREACH (_ IN CASE WHEN l IS NULL THEN [] ELSE [1] END | CREATE (w)-[:AT]->(l))
    RETURN w.id AS id, e.name AS engineer, l.bin AS bin`,
  who_fixed: `
    MATCH (e:Engineer)-[:SIGNED_OFF]->(:WorkOrder)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})
    RETURN e.name AS engineer, count(*) AS jobs ORDER BY jobs DESC LIMIT 10`,
  why_task: `
    MATCH (t:TaskCard {id:$task_id})-[:CITES]->(f:FixOrder)
    OPTIONAL MATCH (f)-[:SUPERSEDES*1..5]->(old:FixOrder)
    OPTIONAL MATCH (d:Decision)-[:BASED_ON]->(f)
    RETURN t.title AS task, f.ad_no AS fix, collect(DISTINCT old.ad_no) AS replaces,
      count(d) AS decisions`,
  // --- UI views (not agent tools) ---
  // Fuselage map: per stringer x 20-inch station cell, distinct aircraft reporting in
  // the window before $asOf. One live query per slider position.
  fleet_map: `
    MATCH (b:Location {level:'bin', family:$family, chapter:coalesce($chapter, '53')})
    WHERE b.stringer IS NOT NULL
    MATCH (r:Report)-[:AT]->(b)
    WHERE r.date < $asOf AND r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 365)}))
      AND ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
    MATCH (r)-[:ON]->(a:Aircraft)
    WHERE $variants IS NULL OR a.variant IN $variants
    RETURN b.stringer AS stringer, b.side AS side, b.station_bin AS station, count(DISTINCT a) AS aircraft, count(r) AS reports`,
  // Per line: distinct aircraft in the window before asOf (ac) and the window before that (ac_prev).
  // The map margin; hotspots is the same count ranked, for the agent.
  line_window: `
    MATCH (line:Location {level:'line', family:$family, chapter:coalesce($chapter, '53')})
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE r.date < $asOf AND r.date >= toString(date($asOf) - duration({days: 2 * coalesce($windowDays, 365)}))
      AND ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
    MATCH (r)-[:ON]->(a:Aircraft)
    WHERE $variants IS NULL OR a.variant IN $variants
    WITH line, a, r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 365)})) AS recent
    RETURN line.bin AS line, count(DISTINCT CASE WHEN recent THEN a END) AS ac, count(DISTINCT CASE WHEN NOT recent THEN a END) AS ac_prev`,
  // Yearly distinct aircraft per line (e.g. S-4 vs the rest of the fuselage).
  line_trend: `
    MATCH (line:Location {level:'line', family:$family, chapter:coalesce($chapter, '53')})
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
      AND r.date >= coalesce($from, '2008-01-01') AND r.date < coalesce($to, '2013-01-01')
    MATCH (r)-[:ON]->(a:Aircraft)
    WHERE $variants IS NULL OR a.variant IN $variants
    RETURN line.bin AS line, substring(r.date, 0, 4) AS year, count(DISTINCT a) AS aircraft`,
  // Distinct aircraft per calendar year across a set of lines (e.g. S-4L and S-4R together).
  lines_by_year: `
    MATCH (line:Location) WHERE line.bin IN $lines
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
      AND r.date >= coalesce($from, '2008-01-01') AND r.date < coalesce($to, '2013-01-01')
    MATCH (r)-[:ON]->(a:Aircraft)
    WHERE $variants IS NULL OR a.variant IN $variants
    RETURN substring(r.date, 0, 4) AS year, count(DISTINCT a) AS aircraft, count(DISTINCT r) AS reports ORDER BY year`,
  // One failure mode with its evidence, for the approval card.
  mode_card: `
    MATCH (m:FailureMode {id:$id})
    OPTIONAL MATCH (e)-[:EVIDENCE_FOR]->(m)
    OPTIONAL MATCH (m)-[:MERGED_INTO]->(n:FailureMode)
    RETURN m {.*} AS mode, n.id AS merged_into, collect({label: labels(e)[0], id: coalesce(e.id, e.ev_id), date: e.date, text: coalesce(e.text, e.cause_text)}) AS evidence`,
  // Modes a person already decided on (deferred, or reopened) whose evidence grew since:
  // 3+ new linked items, or a new accident. Offer again. Never-decided drafts don't count;
  // a decision stored without acc_at_decision claims no new accident.
  reoffer_candidates: `
    MATCH (m:FailureMode) WHERE m.status IN ['dormant','proposed'] AND m.decided_at IS NOT NULL
    OPTIONAL MATCH (e)-[:EVIDENCE_FOR]->(m)
    WITH m, count(e) AS now, count(CASE WHEN e:Accident THEN 1 END) AS acc
    WITH m, now, acc - coalesce(m.acc_at_decision, acc) AS newAcc
    WHERE now > coalesce(m.support_at_decision, 0) + 2 OR newAcc > 0
    RETURN m.id AS id, m.name AS name, m.status AS status, m.decision_reason AS reason,
      coalesce(m.support_at_decision, 0) AS then, now, newAcc ORDER BY now DESC`,
  // UI only: every live mode, for the Same-as-X picker.
  mode_list: `
    MATCH (m:FailureMode) WHERE m.status <> 'merged'
    RETURN m.id AS id, m.name AS name, m.status AS status ORDER BY m.status, m.name`,
  // UI only, never an MCP tool: fold a draft into an existing mode (Same-as-X).
  // Evidence links move to the surviving mode; the old node stays as a merged stub.
  merge_mode: `
    MATCH (old:FailureMode {id:$id}) WHERE old.status IN ['proposed','dormant']
    MATCH (new:FailureMode {id:$into}) WHERE new.id <> old.id AND new.status IN ['confirmed','dormant','proposed']
    OPTIONAL MATCH (e)-[r:EVIDENCE_FOR]->(old)
    WITH old, new, collect(e) AS ev, collect(r) AS rs
    MERGE (old)-[:MERGED_INTO]->(new)
    SET old.status = 'merged', old.decided_by = $by, old.decided_at = $at, old.decision_reason = $reason
    FOREACH (x IN ev | MERGE (x)-[:EVIDENCE_FOR]->(new))
    FOREACH (x IN rs | DELETE x)
    RETURN old.id AS id, old.status AS status, new.id AS into, size(ev) AS moved`,
  // UI only, never an MCP tool: a person approves (confirmed) or defers (dormant) a proposed
  // mode, or reopens it; who, when, why and the evidence counts are stored on the node.
  // Approval stamps known_from (latest evidence date), so replays before then never rank it.
  decide_mode: `
    MATCH (m:FailureMode {id:$id})
    WHERE ($decision = 'reopen' AND m.status IN ['confirmed', 'dormant'] AND m.origin <> 'seed')
       OR ($decision <> 'reopen' AND m.status IN ['proposed', 'dormant'])
    OPTIONAL MATCH (e)-[:EVIDENCE_FOR]->(m)
    WITH m, count(e) AS support, count(CASE WHEN e:Accident THEN 1 END) AS acc, max(e.date) AS lastEv
    SET m.status = CASE $decision WHEN 'approve' THEN 'confirmed' WHEN 'defer' THEN 'dormant' ELSE 'proposed' END,
      m.approved_by = CASE $decision WHEN 'approve' THEN $by ELSE null END,
      m.approved_at = CASE $decision WHEN 'approve' THEN $at ELSE null END,
      m.known_from = CASE $decision WHEN 'approve' THEN coalesce(m.known_from, lastEv) ELSE m.known_from END,
      m.decided_by = $by, m.decided_at = $at, m.decision_reason = $reason, m.support_at_decision = support,
      m.acc_at_decision = acc
    RETURN m.id AS id, m.status AS status, support`,
  // Live node/edge counts for the data-model view.
  graph_stats: `
    MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n`,
  // One typed, labelled count per schema edge: ~0.1 s in all. A label-free scan of every edge
  // takes ~0.8 s, at FalkorDB's 1 s read timeout. Add new edge types to SCHEMA_EDGES.
  edge_stats: SCHEMA_EDGES.map(([a, t, b]) => `
    MATCH (:${a})-[e:${t}]->(:${b}) RETURN '${a}' AS from, '${t}' AS type, '${b}' AS to, count(e) AS n`).join("\n    UNION ALL"),
  // The reports behind one map cell (or any location key), newest first.
  bin_reports: `
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})
    WHERE r.date < $asOf AND r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 365)}))
      AND ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
    MATCH (r)-[:ON]->(a:Aircraft)
    WHERE $variants IS NULL OR a.variant IN $variants
    RETURN r.id AS id, r.date AS date, a.tail AS tail, a.variant AS variant, r.part AS part, r.condition AS condition, r.text AS text
    ORDER BY r.date DESC LIMIT 60`,
  // Induced subgraph over the nodes an investigation touched (typed keys, indexed lookups).
  subgraph: `
    CALL {
      MATCH (n:Accident) WHERE n.ev_id IN coalesce($accidents, []) RETURN n
      UNION MATCH (n:Report) WHERE n.id IN coalesce($reports, []) RETURN n
      UNION MATCH (n:Aircraft) WHERE n.id IN coalesce($aircraft, []) RETURN n
      UNION MATCH (n:Location) WHERE n.bin IN coalesce($locations, []) RETURN n
      UNION MATCH (n:FixOrder) WHERE n.ad_no IN coalesce($fixorders, []) RETURN n
      UNION MATCH (n:FailureMode) WHERE n.id IN coalesce($modes, []) RETURN n
      UNION MATCH (:Accident)-[:FOUND]->(n:Finding) WHERE split(n.id, '/')[0] IN coalesce($accidents, []) RETURN n
    }
    WITH collect(n) AS ns
    UNWIND ns AS a
    OPTIONAL MATCH (a)-[r]->(b) WHERE b IN ns
    RETURN a AS node, collect(CASE WHEN r IS NULL THEN null ELSE {type: type(r), to: id(b)} END) AS out`,
  stale_tasks: `
    MATCH (t:TaskCard)-[:CITES]->(old:FixOrder)<-[:SUPERSEDES]-(new:FixOrder)
    RETURN t.id AS task, old.ad_no AS cited, new.ad_no AS current LIMIT 50`,
};
