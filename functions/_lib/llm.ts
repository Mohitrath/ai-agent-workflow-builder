/** Calls Groq's OpenAI-compatible API, with a disclosed stub when no key is configured. */
export type LlmResult = { text: string; raw?: any };
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
async function callLlmOnce(prompt: string, systemPrompt?: string): Promise<LlmResult> {
  if (!GROQ_API_KEY) { await new Promise((r) => setTimeout(r, 800)); return { text: `[STUBBED LLM RESPONSE — no GROQ_API_KEY set] Echo: ${prompt.slice(0, 200)}` }; }
  const resp = await fetch(GROQ_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_API_KEY}` }, body: JSON.stringify({ model: GROQ_MODEL, messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: prompt }], temperature: 0.3 }) });
  if (!resp.ok) throw new Error(`LLM API error (${resp.status}): ${await resp.text()}`);
  const json = await resp.json(); return { text: json.choices?.[0]?.message?.content ?? "", raw: json };
}
export async function callLlmWithRetry(prompt: string, systemPrompt?: string, maxAttempts = 2): Promise<{ result: LlmResult; attempts: number }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) { try { return { result: await callLlmOnce(prompt, systemPrompt), attempts: attempt }; } catch (err: any) { lastError = err; if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt)); } }
  throw lastError;
}
