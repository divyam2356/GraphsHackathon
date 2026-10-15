// LLM key check: node scripts/test-llm.mjs
// Reads .env (tiny parser, no deps), sends the real relevance-judge prompt
// via OpenAI-compatible endpoint, prints verdict. Exit 1 on failure.
import { readFileSync, existsSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const base = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const model = process.env.LLM_MODEL ?? "openrouter/free";
if (!process.env.LLM_API_KEY) { console.log("NO KEY: set LLM_API_KEY in .env"); process.exit(1); }
const body = {
  model, max_tokens: 1000,
  messages: [
    { role: "system", content: 'You triage aircraft maintenance reports. Reply ONLY JSON: {"keep":boolean,"reason":string}.' },
    { role: "user", content: "Report: stringer clip cracks at STR 4L BS 639. Accident cause: fuselage crown skin panel at the S-4L lap joint" },
  ],
};
const r = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` },
  body: JSON.stringify(body),
});
console.log("status:", r.status, "| model:", model);
const j = await r.json();
const content = j.choices?.[0]?.message?.content;
console.log("content:", JSON.stringify(content)?.slice(0, 400));
if (!r.ok || !content) { console.log("FAIL:", JSON.stringify(j).slice(0, 300)); process.exit(1); }
try { console.log("parsed:", JSON.stringify(JSON.parse(content))); }
catch { console.log("UNPARSEABLE (model ignored JSON instruction)"); process.exit(1); }
console.log("LLM KEY WORKS");
