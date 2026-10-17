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
  ["FailureMode", "MERGED_INTO", "FailureMode"], ["Investigation", "ABOUT", "Accident"], ["Investigation", "KEPT", "Report"],
  ["Alert", "AT", "Location"], ["Alert", "FOR", "Aircraft"], ["WorkOrder", "FROM", "Alert"], ["WorkOrder", "AT", "Location"],
  ["WorkOrder", "ON", "Aircraft"], ["Engineer", "ASSIGNED", "WorkOrder"],
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
  // PRECURSOR_OF holds the latest judgment; KEPT keeps every run's own (runId is set by the harness).
  record_precursor: `
    MATCH (r:Report {id:$reportId}), (a:Accident {ev_id:$accidentId})
    MERGE (r)-[p:PRECURSOR_OF]->(a)
    SET p.confidence=$confidence, p.reason=$reason, p.asOf=$asOf
    WITH r, p OPTIONAL MATCH (i:Investigation {id:$runId})
    FOREACH (_ IN CASE WHEN i IS NULL THEN [] ELSE [1] END |
      MERGE (i)-[k:KEPT]->(r) SET k.confidence=$confidence, k.reason=$reason)
    RETURN p.confidence AS ok`,
  // Memory across sessions: what earlier runs on this accident kept and concluded, judged runs
  // first. Only runs whose investigation date is not later than this one's (no hindsight).
  past_investigations: `
    MATCH (i:Investigation)-[:ABOUT]->(:Accident {ev_id:$ev_id})
    WHERE i.finished IS NOT NULL AND i.asOf <= $asOf
    OPTIONAL MATCH (i)-[k:KEPT]->(r:Report)
    WITH i, collect(CASE WHEN r IS NULL THEN null ELSE {report: r.id, confidence: k.confidence, reason: k.reason} END) AS kept
    RETURN i.id AS id, i.started AS run_at, i.mode AS mode, i.model AS model, i.asOf AS asOf, kept, i.leads AS leads
    ORDER BY CASE WHEN size(kept) > 0 THEN 0 ELSE 1 END, run_at DESC LIMIT 5`,
  // Harness only, never MCP tools: the run log behind past_investigations (the model can't write it).
  start_investigation: `
    MATCH (a:Accident {ev_id:$ev_id})
    CREATE (i:Investigation {id:randomUUID(), asOf:$asOf, mode:$mode, model:$model, question:$question, started:$at})-[:ABOUT]->(a)
    RETURN i.id AS id`,
  // A recorded run (replay file) added to the log once, under a fixed id (remember.ts).
  remember_replay: `
    MATCH (a:Accident {ev_id:$ev_id})
    MERGE (i:Investigation {id:$id})
      ON CREATE SET i.asOf = $asOf, i.mode = $mode, i.model = $model, i.question = $question,
        i.started = $at, i.finished = $at, i.leads = $leads, i.answer = $answer, i.source = 'replay'
    MERGE (i)-[:ABOUT]->(a)
    RETURN i.id AS id`,
  finish_investigation: `
    MATCH (i:Investigation {id:$id})
    SET i.finished = $at, i.leads = $leads, i.answer = $answer
    RETURN i.id AS id`,
  // --- Watcher -> investigator hand-off: the alert is shared state in the graph ---
  // One alert per line and date (watching twice adds nothing), linked to every aircraft that
  // reported there in the window under the same filter as the hotspot that raised it.
  raise_alert: `
    MATCH (line:Location {bin:$bin})
    MERGE (al:Alert {bin:$bin, asOf:$asOf})
      ON CREATE SET al.id = randomUUID(), al.status = 'open', al.reason = $reason, al.part = $part,
        al.condition = $condition, al.raised_on = toString(date())
    MERGE (al)-[:AT]->(line)
    WITH al, line
    OPTIONAL MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE r.date < $asOf AND r.date >= toString(date($asOf) - duration({days: coalesce($windowDays, 365)}))
      AND ($part IS NULL OR r.part = $part) AND ($condition IS NULL OR r.condition CONTAINS $condition)
    OPTIONAL MATCH (r)-[:ON]->(a:Aircraft)
    WITH al, collect(DISTINCT a) AS acs
    FOREACH (a IN acs | MERGE (al)-[:FOR]->(a))
    RETURN al.id AS id, al.bin AS bin, al.asOf AS asOf, al.status AS status, size(acs) AS aircraft`,
  open_alerts: `
    MATCH (al:Alert {status:'open'}) WHERE al.asOf <= $asOf
    OPTIONAL MATCH (al)-[:FOR]->(a:Aircraft)
    RETURN al.id AS id, al.bin AS bin, al.asOf AS asOf, al.reason AS reason, count(a) AS aircraft
    ORDER BY al.asOf DESC, aircraft DESC LIMIT 10`,
  // The investigator's view of one alert: the aircraft it names (most reports first), then the
  // others with a matching report on the same line in the window (e.g. any crack, not only skin).
  alert_aircraft: `
    MATCH (al:Alert {id:$id})-[:AT]->(line:Location)
    MATCH (r:Report)-[:AT]->(:Location)-[:WITHIN*0..1]->(line)
    WHERE r.date < al.asOf AND r.date >= toString(date(al.asOf) - duration({days: coalesce($windowDays, 365)}))
      AND ($condition IS NULL OR r.condition CONTAINS $condition)
    MATCH (r)-[:ON]->(a:Aircraft)
    OPTIONAL MATCH (al)-[f:FOR]->(a)
    WITH al, a, f IS NOT NULL AS named, count(r) AS reports, max(r.date) AS last,
      collect(DISTINCT toLower(trim(coalesce(r.part, '') + ' ' + coalesce(r.condition, ''))))[0..3] AS what
    RETURN al.bin AS bin, a.id AS aircraft, a.tail AS tail, a.variant AS variant, named, reports, last, what
    ORDER BY named DESC, reports DESC, tail LIMIT 100`,
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
  // A draft inspection order for an alert (one per alert), at the alert's line and on the
  // aircraft it names. Only a draft: a person dispatches it in the UI (dispatch_work_order).
  create_work_order: `
    MATCH (al:Alert {id:$alertId})-[:AT]->(l:Location)
    MERGE (w:WorkOrder {alert:$alertId})
      ON CREATE SET w.id = randomUUID(), w.team = $team, w.task = $task, w.status = 'draft',
        w.synthetic = true, w.drafted_on = toString(date())
    MERGE (w)-[:FROM]->(al)
    MERGE (w)-[:AT]->(l)
    WITH w, al
    OPTIONAL MATCH (al)-[:FOR]->(a:Aircraft)
    WITH w, collect(a) AS acs
    FOREACH (a IN acs | MERGE (w)-[:ON]->(a))
    RETURN w.id AS id, w.status AS status, w.team AS team, w.task AS task, size(acs) AS aircraft`,
  // UI only, never MCP tools: a person dispatches a draft (assigned to the least-loaded engineer
  // on its team; the alert becomes actioned) or dismisses an open alert (its draft is cancelled).
  dispatch_work_order: `
    MATCH (w:WorkOrder {id:$id}) WHERE w.status = 'draft'
    MATCH (e:Engineer)-[:MEMBER_OF]->(t:Team) WHERE t.name = w.team
    OPTIONAL MATCH (e)-[:ASSIGNED]->(prev:WorkOrder)
    WITH w, e, count(prev) AS load ORDER BY load ASC, e.name LIMIT 1
    MERGE (e)-[:ASSIGNED]->(w)
    SET w.status = 'dispatched', w.dispatched_by = $by, w.dispatched_at = $at, w.decision_reason = $reason
    WITH w, e
    OPTIONAL MATCH (w)-[:FROM]->(al:Alert)
    SET al.status = 'actioned'
    RETURN w.id AS id, w.status AS status, w.team AS team, e.name AS engineer`,
  dismiss_alert: `
    MATCH (al:Alert {id:$id}) WHERE al.status = 'open'
    SET al.status = 'dismissed', al.decided_by = $by, al.decided_at = $at, al.decision_reason = $reason
    WITH al
    OPTIONAL MATCH (w:WorkOrder)-[:FROM]->(al) WHERE w.status = 'draft'
    SET w.status = 'cancelled'
    RETURN al.id AS id, al.status AS status`,
  who_fixed: `
    MATCH (e:Engineer)-[:ASSIGNED]->(:WorkOrder)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})
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
      UNION MATCH (n:Alert) WHERE n.id IN coalesce($alerts, []) RETURN n
      UNION MATCH (n:WorkOrder) WHERE n.id IN coalesce($workorders, []) RETURN n
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
