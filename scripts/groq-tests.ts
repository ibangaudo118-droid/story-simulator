/** Groq client tests with a mocked fetch (no network): npx tsx scripts/groq-tests.ts */
import { groqLlm } from "../lib/narrator/groq";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}

type Call = { url: string; init: RequestInit };
function mock(responses: Response[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses[Math.min(calls.length - 1, responses.length - 1)].clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const ok = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function main(): Promise<void> {
  // 1. request shape
  {
    const { fetchImpl, calls } = mock([ok('{"paragraphs":[]}')]);
    const llm = groqLlm({ apiKey: "k", model: "test-model", fetchImpl });
    const out = await llm({ system: "SYS", user: "USR" });
    const body = JSON.parse(String(calls[0].init.body));
    const headers = calls[0].init.headers as Record<string, string>;
    check("posts to Groq's OpenAI-compatible chat completions endpoint", calls[0].url === "https://api.groq.com/openai/v1/chat/completions");
    check("sends bearer auth", headers.authorization === "Bearer k");
    check("sends system + user messages and the chosen model", body.model === "test-model" && body.messages[0].role === "system" && body.messages[0].content === "SYS" && body.messages[1].content === "USR");
    check("requests JSON mode", body.response_format?.type === "json_object");
    check("returns message content", out === '{"paragraphs":[]}');
  }

  // 1b. gpt-oss defaults
  {
    const { fetchImpl, calls } = mock([ok("{}")]);
    delete process.env.GROQ_MODEL;
    await groqLlm({ apiKey: "k", fetchImpl })({ system: "s", user: "u" });
    const body = JSON.parse(String(calls[0].init.body));
    check("default model is openai/gpt-oss-120b", body.model === "openai/gpt-oss-120b");
    check("gpt-oss sends reasoning_effort=low and max_completion_tokens=4096", body.reasoning_effort === "low" && body.max_completion_tokens === 4096 && body.max_tokens === undefined);
    check("never sends reasoning_format/include_reasoning (incompatible with JSON mode)", body.reasoning_format === undefined && body.include_reasoning === undefined);
  }
  {
    const { fetchImpl, calls } = mock([ok("{}")]);
    await groqLlm({ apiKey: "k", model: "some/other-model", fetchImpl })({ system: "s", user: "u" });
    check("reasoning_effort is only sent to gpt-oss models", JSON.parse(String(calls[0].init.body)).reasoning_effort === undefined);
  }
  {
    const { fetchImpl, calls } = mock([ok("{}")]);
    await groqLlm({ apiKey: "k", reasoningEffort: "high", fetchImpl })({ system: "s", user: "u" });
    check("reasoningEffort option overrides the default", JSON.parse(String(calls[0].init.body)).reasoning_effort === "high");
  }
  {
    const empty = new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), { status: 200 });
    const { fetchImpl } = mock([empty]);
    let msg = "";
    try {
      await groqLlm({ apiKey: "k", fetchImpl })({ system: "s", user: "u" });
    } catch (e) {
      msg = (e as Error).message;
    }
    check("empty content (reasoning ate the budget) throws a clear error", msg.includes("finish_reason=length"));
  }

  // 2. 429 => waits then retries once
  {
    const { fetchImpl, calls } = mock([new Response("slow down", { status: 429, headers: { "retry-after": "1" } }), ok("{}")]);
    let slept = 0;
    const llm = groqLlm({ apiKey: "k", fetchImpl, sleep: async (ms) => void (slept = ms) });
    const out = await llm({ system: "s", user: "u" });
    check("429 triggers one wait-and-retry", calls.length === 2 && out === "{}" && slept === 1000);
  }

  // 3. model rejects response_format => retry without it
  {
    const { fetchImpl, calls } = mock([new Response('{"error":{"message":"response_format not supported"}}', { status: 400 }), ok("{}")]);
    const llm = groqLlm({ apiKey: "k", fetchImpl });
    await llm({ system: "s", user: "u" });
    const second = JSON.parse(String(calls[1].init.body));
    check("400 about response_format retries without JSON mode", calls.length === 2 && second.response_format === undefined && second.reasoning_effort === undefined);
  }

  // 4. hard errors surface (narrator then falls back to template)
  {
    const { fetchImpl } = mock([new Response("boom", { status: 500 })]);
    const llm = groqLlm({ apiKey: "k", fetchImpl });
    let msg = "";
    try {
      await llm({ system: "s", user: "u" });
    } catch (e) {
      msg = (e as Error).message;
    }
    check("non-retryable errors throw with status", msg.includes("Groq API 500"));
  }

  // 5. <think> blocks stripped
  {
    const { fetchImpl } = mock([ok('<think>{not json}</think>{"paragraphs":[]}')]);
    const out = await groqLlm({ apiKey: "k", fetchImpl })({ system: "s", user: "u" });
    check("strips <think> blocks from reasoning models", out === '{"paragraphs":[]}');
  }

  // 6. missing key
  {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    let threw = false;
    try {
      groqLlm();
    } catch {
      threw = true;
    }
    if (saved) process.env.GROQ_API_KEY = saved;
    check("missing GROQ_API_KEY throws a clear error", threw);
  }

  // 7. env-driven model
  {
    process.env.GROQ_MODEL = "env-model";
    const { fetchImpl, calls } = mock([ok("{}")]);
    await groqLlm({ apiKey: "k", fetchImpl })({ system: "s", user: "u" });
    check("GROQ_MODEL env var selects the model", JSON.parse(String(calls[0].init.body)).model === "env-model");
    delete process.env.GROQ_MODEL;
  }
}

main().then(() => {
  console.log(failures === 0 ? "\nAll Groq client tests passed." : `\n${failures} Groq test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
});
