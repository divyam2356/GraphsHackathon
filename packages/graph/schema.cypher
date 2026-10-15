// Runnable DDL — FalkorDB. Syntax verified vs docs.falkordb.com (Oct 2026).
// Constraints are NOT Neo4j-style: they are GRAPH.CONSTRAINT CREATE commands
// (via redis-cli or client.createConstraint), and UNIQUE needs an exact-match
// index first. Every node carries a date property for the time machine.

// ---- Exact-match indexes (needed before UNIQUE constraints) ----
CREATE INDEX FOR (a:Accident) ON (a.ev_id);
CREATE INDEX FOR (t:Aircraft) ON (t.tail);
CREATE INDEX FOR (f:FixOrder) ON (f.ad_no);
CREATE INDEX FOR (l:Location) ON (l.bin);
CREATE INDEX FOR (m:FailureMode) ON (m.id);

// ---- Unique constraints (run via redis-cli / client.createConstraint) ----
// GRAPH.CONSTRAINT CREATE blackbox UNIQUE NODE Accident PROPERTIES 1 ev_id
// GRAPH.CONSTRAINT CREATE blackbox UNIQUE NODE Aircraft PROPERTIES 1 tail
// GRAPH.CONSTRAINT CREATE blackbox UNIQUE NODE FixOrder PROPERTIES 1 ad_no
// (async: returns PENDING — check CALL db.constraints())

// ---- Full-text (keyword "lap joint", "S-4L") ----
CALL db.idx.fulltext.createNodeIndex('Report', 'text');
CALL db.idx.fulltext.createNodeIndex('Finding', 'text');

// ---- Vector (similar wording, different phrasing). 384 = bge-small-en-v1.5 ----
CREATE VECTOR INDEX FOR (r:Report) ON (r.embedding) OPTIONS {dimension:384, similarityFunction:'cosine'};
// insert: CREATE (:Report {id:'..', text:'..', date:'2010-03-12', embedding: vecf32([...])})
// query:  CALL db.idx.vector.queryNodes('Report','embedding',10,vecf32($vec)) YIELD node, score

// ---- Algorithms (agent calls these as MCP tools, never raw) ----
// hotspots:  CALL algo.labelPropagation({nodeLabels:['Report'], relationshipTypes:['CO_Q'], maxIterations:10})
//            YIELD node, communityId   (over temp per-window :CO_Q edges — see queries/hotspots.cypher)
// keystone:  CALL algo.pageRank('Location','NEAR') YIELD node, score   (stretch)
// fix chain: CALL algo.SPpaths({sourceNode:a, targetNode:b, relDirection:'both', pathCount:3}) YIELD path
