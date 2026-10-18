// Plain-English notes for aviation and graph terms, for viewers who don't know aircraft.
// Shown as tooltips: put one in a data-tip attribute (HTML or SVG) or use <Term tip={…}>.

export const TERMS = {
  stringer: "Stringers are long stiffeners that run nose to tail under the skin. They are numbered down each side from the top of the fuselage: S-4L is the 4th stringer on the left.",
  stringerWhat: "Stringers are long stiffeners that run nose to tail under the skin.",
  line: "A stringer line is one stringer along the whole length of the fuselage, like S-4L.",
  bodyStation: "Body station (BS) is the distance in inches from a fixed point at the nose. BS 620 is 620 inches back.",
  crown: "The crown is the top of the fuselage, where the left and right sides meet.",
  sides: "The fuselage skin drawn unrolled flat: the right side above the dashed crown line, the left side below it.",
  lapJoint: "A lap joint is where two skin panels overlap and are riveted together.",
  classics: "The Boeing 737 Classics are the 737-300, -400 and -500, built from 1984 to 2000. Southwest 812 was a 737-300.",
  ntsb: "The NTSB (US National Transportation Safety Board) investigates accidents and decides their probable cause.",
  tail: "The tail number is the aircraft's registration, like a licence plate.",
  report: "A Service Difficulty Report: a defect a mechanic found and reported to the US FAA.",
  ad: "An Airworthiness Directive (AD): a legally binding FAA order to inspect or fix a known problem.",
  finding: "What NTSB investigators found went wrong. A cause finding is part of the probable cause.",
  location: "A spot on the aircraft in the graph: the fuselage, then a stringer line, then a 20-inch section of that line.",
  precursor: "A report on the same aircraft, at the spot the NTSB blamed, dated before the accident: a possible warning sign.",
  alert: "Saved by the watcher on a line where reports are rising, for the investigator to pick up.",
  workOrder: "A job for a maintenance team. The investigator can only draft one; a person dispatches it.",
  timeMachine: "Every query only sees records dated before this day, so the agent can't use hindsight.",
  aircraftPerCell: "How many different aircraft reported a matching defect in that cell in the 12 months before the date.",
  aircraftPerLine: "Aircraft that reported something on each stringer line in the 12 months before the date. The tick is the same count a year earlier; orange is the rise.",
  fleetLift: "Aircraft on this line in the last 12 months divided by the 12 months before. Above 1 means rising.",
  fleet: "The run compares N632SW with the other 737 Classics (-300, -400, -500) in the FAA reports, the same aircraft the map shows. US airlines only.",
  queryTime: "The graph query behind the map, and how long FalkorDB took to answer it.",
  cypher: "Cypher is the query language of the graph database (FalkorDB). Each tool runs one fixed query.",
  leads: "The system points at what to inspect first. Only the NTSB decides causes.",
  panel: "The panel that tore open on Southwest 812. The NTSB found it had been installed badly when the aircraft was built.",
  whyTool: "An MCP tool: it walks back from a decision (a work order, a failure mode) to the records behind it and the person who made it.",
  section: "A paragraph of an official document in the graph (an FAA fix order or the NTSB brief), dated by its document, so the time machine applies to it too.",
};

/** What each Board filter counts. */
export const FILTER_TIPS = {
  skin: "Only reports of cracked skin.",
  crack: "Cracks in any part: skin, stringers, clips, frames.",
  all: "Every fuselage report, whatever the defect: cracks, corrosion, dents and more.",
};

/** How each run mode works. */
export const MODE_TIPS = {
  agent: "A language model on OpenRouter decides which tools to call and writes the answer.",
  agentOff: "Needs OPENROUTER_API_KEY in .env.",
  scripted: "No model: the same tools, always in the same order. Fast and repeatable.",
  recorded: "A saved run of the live model, replayed. Works offline.",
};

/** One line per MCP tool, in plain English. */
export const TOOL_TIPS: Record<string, string> = {
  search_accidents: "Searches NTSB accident reports by keyword.",
  get_accident: "Reads the NTSB record: the aircraft, the date and what investigators found.",
  past_investigations: "What earlier runs on this accident concluded, and which reports they kept.",
  prior_reports: "This aircraft's own maintenance reports at that spot, before the date.",
  fleet_reports: "How many other aircraft of the same type reported trouble on that line.",
  hotspots: "Ranks stringer lines by how fast reports rose over the past year.",
  similar_reports: "Finds maintenance reports with similar wording across the fleet.",
  fix_orders: "FAA fix orders (Airworthiness Directives) for that spot, issued before the date.",
  explain_path: "The chain of graph links that connects a report to the accident.",
  rank_failure_modes: "Checks known failure patterns against this case, using only patterns known before the date.",
  failure_mode_candidates: "Unconfirmed failure patterns that might fit, waiting for a person.",
  reoffer_candidates: "Deferred patterns that gained new evidence since a person last looked.",
  open_alerts: "Alerts nobody has acted on yet.",
  alert_aircraft: "The aircraft behind an alert, widened to any crack on that line.",
  who_fixed: "Engineers who worked on that spot before.",
  why_task: "Why a maintenance task exists: the fix order it cites.",
  stale_tasks: "Tasks that still cite a fix order that has since been replaced.",
  record_precursor: "Saves a report as a possible warning sign, with a confidence and a reason.",
  raise_alert: "Saves an alert in the graph for the investigator.",
  propose_failure_mode: "Drafts a new failure pattern. Only a person can confirm it.",
  add_support: "Adds a new case as evidence to an existing failure pattern.",
  record_observation: "Logs a mechanic's observation on an aircraft.",
  create_work_order: "Drafts a work order for a team. Only a person can dispatch it.",
  cite_documents: "Paragraphs of the official documents (FAA fix orders, the NTSB brief) about this location, dated before the investigation date.",
  cracks_together: "A graph algorithm (connected components) over lines whose cracks come on the same aircraft: what to inspect together.",
  why: "Walks back from a decision to the records behind it and the person who made it.",
};

/** Tooltip for a record id in an answer: what kind of record it is. */
export function idTip(id: string): string {
  if (/^\d{8}X\d{5}$/.test(id)) return `NTSB event ${id}. Click to open.`;
  if (id.includes("#")) return `Document section ${id}: a paragraph of an official document. Click to open.`;
  if (/^AD-/.test(id)) return `Fix order ${id}. Click to open.`;
  const loc = id.match(/^737\/53(?:\/S(\d+)([LR]))?(?:\/BS(\d+))?$/);
  if (loc) return `Location: Boeing 737, fuselage${loc[1] ? `, stringer S-${loc[1]}${loc[2]}` : ""}${loc[3] ? `, body station ${loc[3]}` : ""}. Click to open.`;
  return `Maintenance report ${id}. Click to open.`;
}
