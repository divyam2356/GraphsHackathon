// Writes the Location hierarchy: (bin)-[:WITHIN]->(line)-[:WITHIN]->(zone),
// zone -[:IN_SYSTEM]-> System (ATA/JASC chapter) and zone -[:FOR]-> Model.
// Queries roll reports up with (r)-[:AT]->(:Location)-[:WITHIN*0..2]->(target).
import type { Db } from "@blackbox/graph/src/db";
import type { LocNode } from "./normalize";
import { writeBatches } from "./load";

export async function writeLocations(db: Db, nodes: LocNode[]): Promise<void> {
  const rows = nodes.map(({ parent, ...props }) => ({ ...props, parent: parent ?? null }));
  await writeBatches(db, `UNWIND $rows AS row
    MERGE (l:Location {bin: row.bin})
    SET l.level = row.level, l.family = row.family, l.chapter = row.chapter,
        l.stringer = row.stringer, l.side = row.side, l.station_bin = row.station_bin`, rows, "locations");
  await writeBatches(db, `UNWIND $rows AS row
    MATCH (l:Location {bin: row.bin}), (p:Location {bin: row.parent})
    MERGE (l)-[:WITHIN]->(p)`, rows.filter((r) => r.parent), "location hierarchy");
  await writeBatches(db, `UNWIND $rows AS row
    MERGE (s:System {chapter: row.chapter})
    MERGE (m:Model {family: row.family})
    WITH row, s, m MATCH (l:Location {bin: row.bin})
    MERGE (l)-[:IN_SYSTEM]->(s)
    MERGE (l)-[:FOR]->(m)`, rows.filter((r) => r.level === "zone"), "zones");
}
