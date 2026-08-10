export async function callHttpWithRetry(config: { url: string; method?: string; headers?: Record<string, string>; body?: any }, maxAttempts = 2): Promise<{ result: { status: number; body: any }; attempts: number }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(config.url, { method: config.method || "GET", headers: { "content-type": "application/json", ...(config.headers || {}) }, body: config.body ? JSON.stringify(config.body) : undefined });
      const contentType = resp.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await resp.json() : await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
      return { result: { status: resp.status, body }, attempts: attempt };
    } catch (err: any) { lastError = err; if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt)); }
  }
  throw lastError;
}
