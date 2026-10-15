import "@blackbox/graph/src/env";
// Seed failure modes: group historical mechanical-cause findings by
// (family, system, location bin, mechanism keyword) -> FailureMode origin:seed.
// Approval-gated modes (accident/observation origin) are drafted by the agent
// via propose_failure_mode and confirmed in the UI — never auto-confirmed here.
import { connect } from "@blackbox/graph/src/db";
import { DEMO } from "@blackbox/graph/src/demo";
const db = await connect();
if (db) {
  for (const m of DEMO.failureModes) {
    await db.query(
      `MERGE (x:FailureMode {id:$id}) SET x.name=$name, x.system=$system, x.mechanism=$mech,
         x.status=$status, x.origin=$origin, x.decision_reason=$reason
       MERGE (mo:Model {family:$fam}) MERGE (x)-[:FOR]->(mo)
       FOREACH (s IN $sig | MERGE (l:Location {bin:s.bin})
         MERGE (x)-[g:SIGNATURE]->(l) SET g.weight=s.w)`,
      { id: m.id, name: m.name, system: m.system, mech: m.mechanism, status: m.status, origin: m.origin, reason: "decision_reason" in m ? m.decision_reason : null, fam: m.family, sig: m.sig });
  }
}
await db?.close();
console.log(`seed done: ${DEMO.failureModes.length} mode(s)`);
