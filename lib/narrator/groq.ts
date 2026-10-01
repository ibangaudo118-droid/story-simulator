import type { LlmFn } from "./narrate";

export interface GroqOptions {
  apiKey?: string;
  /** Defaults to GROQ_MODEL, then "openai/gpt-oss-120b". */
  model?: string;
  /** Sent as max_completion_tokens. For reasoning models this INCLUDES reasoning tokens. */
  maxTokens?: number;
  /** gpt-oss models only: "low" | "medium" | "high". Default "low" (narration needs speed, not deep reasoning). */
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
  /** Defaults to GROQ_API_BASE, then https://api.groq.com/openai/v1 */
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Groq narrator client: OpenAI-compatible chat completions over plain fetch (no SDK dependency).
 * Reads GROQ_API_KEY. Asks for JSON mode; if the chosen model rejects response_format,
 * it retries once without it (the grounding validator still guards the output).
 * gpt-oss models are reasoning models: reasoning tokens count against max_completion_tokens, so
 * the default budget is generous (4096) and reasoning_effort defaults to "low".
 *
 * If your repo already has a Groq helper, you can skip this file and wrap it instead:
 *   const llm: LlmFn = async ({ system, user }) => yourExistingGroqCall(system, user);
 */
export function groqLlm(opts: GroqOptions = {}): LlmFn {
  const apiKey = opts.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const model = opts.model ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  const baseUrl = (opts.baseUrl ?? process.env.GROQ_API_BASE ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const isGptOss = model.startsWith("openai/gpt-oss");
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async ({ system, user }) => {
    const call = (jsonMode: boolean): Promise<Response> =>
      doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: opts.temperature ?? 0.7,
          max_completion_tokens: opts.maxTokens ?? 4096,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          ...(jsonMode && isGptOss ? { reasoning_effort: opts.reasoningEffort ?? "low" } : {}),
        }),
      });

    let res = await call(true);
    if (res.status === 429) {
      const wait = Math.min(10, Number(res.headers.get("retry-after") ?? 2));
      await sleep((Number.isFinite(wait) ? wait : 2) * 1000);
      res = await call(true);
    }
    if (res.status === 400) {
      const body = await res.clone().text();
      if (/response_format|json|reasoning/i.test(body)) res = await call(false);
    }
    if (!res.ok) {
      throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    // some reasoning models emit <think>...</think> before the answer
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!clean) {
      const reason = (data as { choices?: { finish_reason?: string }[] }).choices?.[0]?.finish_reason;
      throw new Error(`Groq returned empty content (finish_reason=${reason ?? "unknown"}); try a larger maxTokens or lower reasoningEffort`);
    }
    return clean;
  };
}
