// Hotspot job: plain counting first; labelPropagation over temp per-window edges as variant.
// Algorithms filter by label+rel-type only, not date -> build :CO_<window> edges, run, delete.
export const HOTSPOT_JOB = `
// 1. build temp co-occurrence edges for window (same bin, distinct tails, same quarter)
MATCH (r1:Report)-[:AT]->(l:Location)<-[:AT]-(r2:Report)
WHERE r1.date >= $from AND r1.date < $to AND r1 <> r2
MERGE (r1)-[:CO_Q]->(r2)
// 2. run: CALL algo.labelPropagation({label:'Report', relationshipType:'CO_Q'})
// 3. read clusters -> write (:HotSpot {window, aircraft_count, lift})-[:AT]->(:Location)
// 4. delete temp edges: MATCH ()-[c:CO_Q]->() DELETE c
// Fallback (implemented in MCP server): distinct-tail counting per bin vs baseline — ship this first.
`;
