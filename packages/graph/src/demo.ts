// Demo seed: the SWA-812 story + fleet + fix chain + org, sized to run without downloads.
// Full ingest (services/ingest) replaces/extends this with real NTSB+FAA CSVs.
export const DEMO = {
  accidents: [
    { ev_id: "WPR11MA133", tail: "N632SW", family: "737", date: "2011-04-01", phase: "climb",
      narrative: "rapid decompression, fuselage crown skin rupture at S-4L lap joint",
      cause: "fuselage crown skin panel at the S-4L lap joint" },
  ],
  priorReports: [
    { id: "SDR-2010-03-N632SW", tail: "N632SW", bin: "S-4L/BS639", date: "2010-03-12", text: "stringer clip cracks at STR 4L BS 639" },
    { id: "SDR-2010-06-N632SW", tail: "N632SW", bin: "S-4L/BS727A", date: "2010-06-02", text: "crack indication crown skin STR 4L BS 727A" },
  ],
  fleetNote: "rough text filter ~67 737 crown-skin S-4 reports 2008–Mar2011 +47 Apr–Dec 2011 (incl. gouges/creases — clean before quoting)",
  fixOrders: [
    { ad: "AD-2011-08-51", date: "2011-04-05", family: "737", bin: "S-4L/BS639", replaces: ["AD-2010-14-07"] },
    { ad: "AD-2010-14-07", date: "2010-07-12", family: "737", bin: "S-4L/BS639", replaces: [] },
  ],
  failureModes: [
    { id: "FM-CROWN-S4L", name: "737 crown-skin lap-joint cracking (S-4L)", system: "structures",
      mechanism: "fatigue cracking at lap joint, stringer 4 left", status: "confirmed", origin: "seed",
      family: "737", sig: [{ bin: "S-4L/BS639", w: 1 }, { bin: "S-4L/BS727A", w: 0.8 }] },
    { id: "FM-ENG-FAN", name: "CFM56 fan-blade fatigue", system: "engines",
      mechanism: "low-cycle fatigue, blade dovetail", status: "confirmed", origin: "seed",
      family: "737", sig: [{ bin: "ENG/FAN-STG1", w: 1 }] },
    { id: "FM-DOOR-AFT", name: "aft cargo door frame cracking (watch)", system: "structures",
      mechanism: "unconfirmed — 2 tails, under review", status: "dormant", origin: "observation",
      family: "737", sig: [{ bin: "DOOR/AFT-CARGO", w: 0.5 }], decision_reason: "only 2 aircraft so far" },
  ],
  org: {
    teams: ["Structures", "Propulsion", "Avionics"],
    engineers: ["A. Rao", "M. Chen", "J. Okafor", "S. Iyer", "L. Park"],
    taskCards: [{ id: "TC-53-041", title: "S-4L lap-joint inspection", cites: "AD-2011-08-51" }],
  },
};
