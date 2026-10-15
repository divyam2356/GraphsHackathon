import "@blackbox/graph/src/env";
// MCP server over stdio. Every tool runs a fixed Cypher query against FalkorDB via
// runTool; a failed query is returned to the agent as a tool error (isError), never
// swapped for fixture data. DEMO=1 serves the offline SWA 812 fixture explicitly.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./tools";
import { demoMode, runTool } from "@blackbox/graph/src/run";

if (demoMode()) console.error("blackbox MCP: DEMO=1, serving the offline fixture (not the graph)");
await buildServer((name, args) => runTool(name, (args ?? {}) as Record<string, unknown>)).connect(new StdioServerTransport());
// The DB client keeps the event loop alive, so exit when the client closes our stdin.
process.stdin.on("end", () => process.exit(0));
