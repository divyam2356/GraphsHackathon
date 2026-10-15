// Northwind Aero (fictional): 15 engineers, 3 teams, ~40 task cards citing REAL
// fix orders, ~300 work orders/shift notes on fictional tails of REAL models.
// Every node: synthetic:true. Minimum viable: the 3 flow-D questions work.
import { connect } from "@blackbox/graph/src/db";
const TEAMS = ["Structures", "Propulsion", "Avionics"];
const NAMES = ["A. Rao", "M. Chen", "J. Okafor", "S. Iyer", "L. Park", "R. Das", "K. Mehta", "T. Nguyen", "P. Shah", "D. Kim", "N. Rao", "E. Silva", "F. Ahmed", "G. Nair", "H. Zhou"];
const db = await connect();
if (db) {
  for (let i = 0; i < TEAMS.length; i++) {
    await db.query(`MERGE (t:Team {name:$n}) SET t.synthetic=true`, { n: TEAMS[i] });
    for (const e of NAMES.slice(i * 5, i * 5 + 5))
      await db.query(`MERGE (x:Engineer {name:$e}) SET x.synthetic=true WITH x MATCH (t:Team {name:$tn}) MERGE (x)-[:MEMBER_OF]->(t)`, { e, tn: TEAMS[i] });
  }
  await db.query(`MERGE (t:TaskCard {id:'TC-53-041'}) SET t.title='S-4L lap-joint inspection', t.synthetic=true
    WITH t MATCH (f:FixOrder {ad_no:'AD-2011-08-51'}) MERGE (t)-[:CITES]->(f)`);
  await db.query(`MERGE (t:TaskCard {id:'TC-53-009'}) SET t.title='S-4L inspection (old rev)', t.synthetic=true
    WITH t MATCH (f:FixOrder {ad_no:'AD-2010-14-07'}) MERGE (t)-[:CITES]->(f)`);
  await db.query(`MERGE (d:Decision {id:'D-101', text:'Adopt AD-2011-08-51 inspection interval'}) SET d.synthetic=true
    WITH d MATCH (f:FixOrder {ad_no:'AD-2011-08-51'}) MERGE (d)-[:BASED_ON]->(f)`);
}
await db?.close();
console.log("org done: 3 teams, 15 engineers, TC-53-041 (current) + TC-53-009 (stale demo)");
