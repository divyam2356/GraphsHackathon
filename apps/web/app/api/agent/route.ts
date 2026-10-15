import { runAgent, runScripted, hasAgentKey, agentModel, type Step } from "@blackbox/agent/src/agent";
// Streams one investigation as NDJSON (one Step per line) so the UI can show each
// tool call as it happens. mode "agent" = model-driven (needs OPENROUTER_API_KEY),
// "scripted" = the same MCP tools in a fixed order, no model.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { mode?: "agent" | "scripted"; question?: string; evId?: string; asOf: string };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (s: Step) => ctrl.enqueue(enc.encode(JSON.stringify(s) + "\n"));
      try {
        if (b.mode === "agent") await runAgent(b.question ?? "", b.asOf, emit);
        else await runScripted(b.evId ?? "20110401X24330", b.asOf, emit);
      } catch (e) {
        emit({ type: "error", text: (e as Error).message });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/** What the agent panel can offer: a live model only when a key is set. */
export async function GET() {
  return Response.json({ live: hasAgentKey(), model: agentModel() });
}
