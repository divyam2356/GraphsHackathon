import "@blackbox/graph/src/env";
// Northwind Aero (fictional): 3 teams, 15 engineers, 2 task cards citing the REAL S-4L
// fix orders (one current, one citing the superseded AD) and 1 decision. Each team OWNS its
// ATA chapters (Structures the fuselage, 53), and the Structures engineers have a made-up
// job history on the 737 fuselage stringer lines (WORKED_ON {date}, 2008-2010, seeded so a
// re-run writes the same edges). Every node and history edge is synthetic:true. Feeds
// create_work_order (team), dispatch_work_order (who knows the line), who_fixed, why_task,
// stale_tasks.
import { connect } from "@blackbox/graph/src/db";
const TEAMS = ["Structures", "Propulsion", "Avionics"];
const NAMES = ["A. Rao", "M. Chen", "J. Okafor", "S. Iyer", "L. Park", "R. Das", "K. Mehta", "T. Nguyen", "P. Shah", "D. Kim", "N. Rao", "E. Silva", "F. Ahmed", "G. Nair", "H. Zhou"];
// ATA chapters each team owns (structures 51-57; engines, APU and fuel; avionics and electrics)
const OWNS: Record<string, string[]> = {
  Structures: ["51", "52", "53", "54", "55", "56", "57"],
  Propulsion: ["28", "49", "61", "71", "72", "73", "74", "75", "76", "77", "78", "79", "80"],
  Avionics: ["22", "23", "24", "31", "33", "34"],
};

/** mulberry32: a tiny seeded PRNG, so the made-up history is the same on every machine. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = await connect();
if (db) {
  for (let i = 0; i < TEAMS.length; i++) {
    await db.query(`MERGE (t:Team {name:$n}) SET t.synthetic=true`, { n: TEAMS[i] });
    for (const e of NAMES.slice(i * 5, i * 5 + 5))
      await db.query(`MERGE (x:Engineer {name:$e}) SET x.synthetic=true WITH x MATCH (t:Team {name:$tn}) MERGE (x)-[:MEMBER_OF]->(t)`, { e, tn: TEAMS[i] });
    await db.query(`MATCH (t:Team {name:$n}), (s:System) WHERE s.chapter IN $chapters MERGE (t)-[:OWNS]->(s)`, { n: TEAMS[i], chapters: OWNS[TEAMS[i]] });
  }
  // Job history: each fuselage stringer line gets one or two Structures engineers with 1-3 jobs each.
  const lines = (await db.query(`MATCH (l:Location {level:'line', family:'737', chapter:'53'}) WHERE l.stringer IS NOT NULL RETURN l.bin AS bin ORDER BY bin`)) as Array<{ bin: string }>;
  const rand = rng(812);
  const day = (r: number) => new Date(Date.UTC(2008, 0, 1) + Math.floor(r * 1095) * 864e5).toISOString().slice(0, 10);
  const jobs: Array<{ e: string; bin: string; date: string }> = [];
  for (const { bin } of lines) {
    const team = NAMES.slice(0, 5), first = Math.floor(rand() * 5);
    const who = rand() < 0.5 ? [team[first]] : [team[first], team[(first + 1 + Math.floor(rand() * 4)) % 5]];
    for (const e of who) for (let k = 1 + Math.floor(rand() * 3); k > 0; k--) jobs.push({ e, bin, date: day(rand()) });
  }
  await db.query(`UNWIND $jobs AS j MATCH (e:Engineer {name:j.e}), (l:Location {bin:j.bin})
    MERGE (e)-[h:WORKED_ON {date:j.date}]->(l) SET h.synthetic=true`, { jobs });
  await db.query(`MERGE (t:TaskCard {id:'TC-53-041'}) SET t.title='S-4L lap-joint inspection', t.synthetic=true
    WITH t MATCH (f:FixOrder {ad_no:'AD-2015-16-08'}) MERGE (t)-[:CITES]->(f)`);
  await db.query(`MERGE (t:TaskCard {id:'TC-53-009'}) SET t.title='S-4L inspection (old rev)', t.synthetic=true
    WITH t MATCH (f:FixOrder {ad_no:'AD-2011-08-51'}) MERGE (t)-[:CITES]->(f)`);
  await db.query(`MERGE (d:Decision {id:'D-101', text:'Adopt AD-2011-08-51 inspection interval'}) SET d.synthetic=true
    WITH d MATCH (f:FixOrder {ad_no:'AD-2011-08-51'}) MERGE (d)-[:BASED_ON]->(f)`);
  console.log(`org done: 3 teams owning ATA chapters, 15 engineers, ${jobs.length} made-up jobs on ${lines.length} fuselage lines, TC-53-041 (current) + TC-53-009 (stale demo)`);
}
await db?.close();
