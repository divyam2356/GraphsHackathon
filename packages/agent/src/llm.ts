// LLM layer (Anthropic Messages API, dependency-free fetch).
// The LLM judges relevance per report and drafts text; it NEVER sets scores
// (formula in scoring.ts) and never writes raw Cypher (fixed queries only).
// No key / any API failure -> deterministic rule fallback, never a crash.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const OA_BASE = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const OA_MODEL = process.env.LLM_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY);
}

async function chatAnthropic(system: string, user: string): Promise<string> {
  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? OA_MODEL, max_tokens: 300, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = (await r.json()) as { content: Array<{ text?: string }> };
  return j.content.map((b) => b.text ?? "").join("");
}

// OpenAI-compatible chat completions (Groq / OpenRouter / Gemini-compat free tiers).
async function chatOA(system: string, user: string): Promise<string> {
  const r = await fetch(`${OA_BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY!}` },
    body: JSON.stringify({ model: OA_MODEL, max_tokens: 300, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = (await r.json()) as { choices: Array<{ message: { content: string } }> };
  return j.choices[0]?.message.content ?? "";
}

async function chat(system: string, user: string): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return chatAnthropic(system, user);
  return chatOA(system, user);
}

export interface Judgment { keep: boolean; reason: string }

// Relevance judge: is this maintenance report a plausible warning sign for an
// accident with this cause? Drops unrelated same-system matches (UPS1354/SWA1380)
// and self-matches (EC135). Warning signs only — never causes.
export async function judgeRelevance(report: string, cause: string): Promise<Judgment> {
  if (!hasKey()) return { keep: true, reason: "rule-fallback (no LLM key)" };
  try {
    const out = await chat(
      "You triage aircraft maintenance reports. Reply ONLY JSON: {\"keep\":boolean,\"reason\":string}. Keep only reports that plausibly foreshadow the accident's mechanical failure mode (same system AND location/mechanism). Drop unrelated matches and reports describing the accident itself. You describe warning signs, never causes.",
      `Report: ${report}\nAccident cause: ${cause}`,
    );
    const j = JSON.parse(out) as Judgment;
    return { keep: Boolean(j.keep), reason: String(j.reason ?? "llm").slice(0, 200) };
  } catch {
    return { keep: true, reason: "rule-fallback (LLM error)" };
  }
}
