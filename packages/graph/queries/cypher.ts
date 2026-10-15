// Fixed Cypher per tool — agent NEVER writes raw Cypher. Verified against
// docs.falkordb.com (Oct 2026): fulltext procs, vector procs + vecf32,
// algo.SPpaths({sourceNode, targetNode...}), algo.labelPropagation,
// algo.pageRank(label, relType). $asOf time-machine cutoff on every read.
export const CYPHER: Record<string, string> = {
  search_accidents: `
    CALL db.idx.fulltext.queryNodes('Finding', $text) YIELD node AS f, score
    MATCH (a:Accident)-[:FOUND]->(f)
    WHERE $asOf IS NULL OR a.date < $asOf
    RETURN a.ev_id AS ev_id, a.date AS date, f.system AS system, f.text AS cause, score
    ORDER BY score DESC LIMIT 25`,
  get_accident: `
    MATCH (a:Accident {ev_id:$ev_id})-[:INVOLVED]->(t:Aircraft)-[:IS_A]->(m:Model)
    OPTIONAL MATCH (a)-[fo:FOUND]->(f:Finding)-[:AT]->(l:Location)
    RETURN a.ev_id AS ev_id, a.date AS date, t.tail AS tail, m.family AS family,
      collect({finding:f.text, rel:type(fo), at:l.bin}) AS findings`,
  prior_reports: `
    MATCH (r:Report)-[:ON]->(:Aircraft {tail:$tail}), (r)-[:AT]->(l:Location)
    WHERE r.date < $asOf AND ($bin IS NULL OR l.bin = $bin)
    RETURN r.id AS id, r.date AS date, r.text AS text, l.bin AS bin
    ORDER BY r.date DESC LIMIT 50`,
  fleet_reports: `
    MATCH (r:Report)-[:ON]->(ac:Aircraft)-[:IS_A]->(:Model {family:$family}), (r)-[:AT]->(l:Location)
    WHERE l.bin = $bin AND $from <= r.date <= $to
    RETURN count(r) AS reports, count(DISTINCT ac.tail) AS aircraft`,
  hotspots: `
    MATCH (r:Report)-[:ON]->(a:Aircraft)-[:IS_A]->(:Model {family:$family}), (r)-[:AT]->(l:Location)
    WHERE r.date < $asOf
    WITH l, count(DISTINCT a.tail) AS ac ORDER BY ac DESC LIMIT 25
    RETURN l.bin AS bin, ac`,
  similar_reports: `
    CALL db.idx.vector.queryNodes('Report', 'embedding', $k, vecf32($vec)) YIELD node AS r, score
    RETURN r.id AS id, r.text AS text, score ORDER BY score DESC`,
  fix_orders: `
    MATCH (f:FixOrder)-[:APPLIES_TO]->(:Model {family:$family})
    WHERE $asOf IS NULL OR f.date <= $asOf
    OPTIONAL MATCH (f)-[:TARGETS]->(l:Location)
    OPTIONAL MATCH (f)-[:SUPERSEDES*0..5]->(old:FixOrder)
    RETURN f.ad_no AS ad, f.date AS date, l.bin AS bin, collect(DISTINCT old.ad_no) AS replaces`,
  explain_path: `
    MATCH (a {id:$from}), (b {id:$to})
    CALL algo.SPpaths({sourceNode:a, targetNode:b, relDirection:'both', pathCount:3}) YIELD path
    RETURN [n IN nodes(path) | {labels:labels(n), id:coalesce(n.id, n.ev_id, n.ad_no)}] AS hops`,
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
    CREATE (al:Alert {id:randomUUID(), date:date(), status:'open', reason:$reason})
    WITH al MATCH (t:Aircraft {tail:$tail}) CREATE (al)-[:FOR]->(t)
    WITH al WHERE $modeId IS NOT NULL
    MATCH (m:FailureMode {id:$modeId}) CREATE (al)-[:MATCHES]->(m)
    RETURN al.id AS id`,
  propose_failure_mode: `
    CREATE (m:FailureMode {id:randomUUID(), name:$name, system:$system, mechanism:$mechanism,
      status:'proposed', origin:'accident', support_at_decision:0}) RETURN m.id AS id`,
  add_support: `
    MATCH (c:Case {id:$caseId}), (m:FailureMode {id:$modeId})
    MERGE (c)-[:SUPPORTS]->(m) RETURN c.id AS ok`,
  record_observation: `
    MATCH (t:Aircraft {tail:$tail}), (l:Location {bin:$bin})
    CREATE (o:Observation {id:randomUUID(), text:$text, date:date($date)})-[:ON]->(t)
    CREATE (o)-[:AT]->(l) RETURN o.id AS id`,
  create_work_order: `
    MATCH (al:Alert {id:$alertId})-[:FOR]->(t:Aircraft)
    CREATE (w:WorkOrder {id:randomUUID(), team:$team, date:date(), synthetic:true})-[:ON]->(t)
    WITH w MATCH (e:Engineer)-[:MEMBER_OF]->(:Team {name:$team})
    CREATE (e)-[:SIGNED_OFF]->(w) RETURN w.id AS id`,
  who_fixed: `
    MATCH (e:Engineer)-[:SIGNED_OFF]->(:WorkOrder)-[:AT]->(l:Location {bin:$bin})
    RETURN e.name AS engineer, count(*) AS jobs ORDER BY jobs DESC LIMIT 10`,
  why_task: `
    MATCH (t:TaskCard {id:$task_id})-[:CITES]->(f:FixOrder)
    OPTIONAL MATCH (f)-[:SUPERSEDES*0..5]->(old:FixOrder)
    OPTIONAL MATCH (d:Decision)-[:BASED_ON]->(f)
    RETURN t.title AS task, f.ad_no AS fix, collect(DISTINCT old.ad_no) AS replaces,
      count(d) AS decisions`,
  stale_tasks: `
    MATCH (t:TaskCard)-[:CITES]->(old:FixOrder)<-[:SUPERSEDES]-(new:FixOrder)
    RETURN t.id AS task, old.ad_no AS cited, new.ad_no AS current LIMIT 50`,
};
