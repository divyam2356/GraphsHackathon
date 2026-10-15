// Fixed Cypher per tool — agent NEVER writes raw Cypher. Verified against
// docs.falkordb.com (Oct 2026): fulltext procs, vector procs + vecf32,
// algo.SPpaths({sourceNode, targetNode...}), algo.labelPropagation,
// algo.pageRank(label, relType). $asOf time-machine cutoff on every read.
// Dates are ISO strings. Locations nest bin -> line -> zone via WITHIN, so
// `(r)-[:AT]->(:Location)-[:WITHIN*0..2]->(:Location {bin:$bin})` rolls a report up
// to any level ("737/53/S4L" = stringer 4 left on the 737 fuselage). Absent optional
// params arrive as null (db.ts withNulls).
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
    MATCH (a) WHERE a.id = $from OR a.ev_id = $from OR a.ad_no = $from OR a.bin = $from
    MATCH (b) WHERE b.id = $to OR b.ev_id = $to OR b.ad_no = $to OR b.bin = $to
    // Evidence edges only: hub types (IS_A, IN_SYSTEM, FOR) and pathCount > 1 make the
    // search enumerate thousands of paths through Model/System nodes and time out.
    CALL algo.SPpaths({sourceNode:a, targetNode:b, relDirection:'both', maxLen:6, pathCount:1,
      relTypes:['ON','INVOLVED','AT','WITHIN','FOUND','PRECURSOR_OF','TARGETS','SUPERSEDES','CITES','MATCHES','SIGNATURE']}) YIELD path
    RETURN [n IN nodes(path) | {labels:labels(n), id:coalesce(n.id, n.ev_id, n.ad_no, n.bin)}] AS hops,
      [r IN relationships(path) | type(r)] AS rels`,
  rank_failure_modes: `
    MATCH (m:FailureMode) WHERE m.status = 'confirmed'
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
  propose_failure_mode: `
    CREATE (m:FailureMode {id:randomUUID(), name:$draft.name, system:$draft.system, mechanism:$draft.mechanism,
      status:'proposed', origin:'accident', support_at_decision:0}) RETURN m.id AS id`,
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
  // Live node/edge counts for the data-model view.
  graph_stats: `
    MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n`,
  edge_stats: `
    MATCH (a)-[e]->(b) RETURN labels(a)[0] AS from, type(e) AS type, labels(b)[0] AS to, count(e) AS n`,
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
