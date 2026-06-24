import { z } from "zod";

export const PlanSchema = z.object({
  summary: z.string(),
  operations: z.array(
    z.object({
      column: z.string(),
      action: z.enum([
        "trim",
        "lowercase",
        "uppercase",
        "to_number",
        "to_date",
        "fill_mean",
        "fill_median",
        "fill_mode",
        "fill_value",
        "drop_empty_rows",
        "remove_duplicates",
      ]),
      value: z.string().optional(),
    }),
  ),
  chart: z
    .object({
      type: z.enum(["bar", "line", "pie"]),
      xColumn: z.string(),
      yColumn: z.string(),
      aggregation: z.enum(["sum", "avg", "count"]),
      title: z.string(),
    })
    .nullable(),
});

export type CleaningPlan = z.infer<typeof PlanSchema>;

export type Provider = "lovable" | "gemini" | "claude" | "openai" | "ollama";

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl?: string; // for ollama / custom openai-compatible
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  lovable: "google/gemini-3-flash-preview",
  gemini: "gemini-2.0-flash",
  claude: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  lovable: "Lovable AI",
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  openai: "OpenAI",
  ollama: "Ollama (local)",
};

const SYSTEM = `You are a data cleaning assistant. Given a dataset preview and a user request (which may be in any language, often Turkish), produce a cleaning plan as structured JSON.

Rules:
- Only use column names that exist in the provided columns list.
- Actions:
  * trim/lowercase/uppercase: string normalization
  * to_number: parse messy numbers (strips currency symbols, thousand separators)
  * to_date: parse dates to ISO YYYY-MM-DD
  * fill_mean/fill_median: numeric column missing-value fill
  * fill_mode: most frequent value fill
  * fill_value: fill missing with provided 'value'
  * drop_empty_rows: column with no value -> drop row
  * remove_duplicates: remove duplicate rows based on this column
- If user asks for a chart/summary/graph, set 'chart' with the right type, x (category/date column), y (numeric column), and aggregation. Otherwise null.
- Summary: 1-3 short sentences in the same language as the user's instruction.

Respond ONLY with valid minified JSON matching this TypeScript type, no markdown, no commentary:
{summary:string; operations:Array<{column:string; action:'trim'|'lowercase'|'uppercase'|'to_number'|'to_date'|'fill_mean'|'fill_median'|'fill_mode'|'fill_value'|'drop_empty_rows'|'remove_duplicates'; value?:string}>; chart:null|{type:'bar'|'line'|'pie'; xColumn:string; yColumn:string; aggregation:'sum'|'avg'|'count'; title:string}}`;

function extractJson(response: string): unknown {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openChar = start !== -1 ? cleaned[start] : "";
  const endChar = openChar === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(endChar);
  if (start === -1 || end === -1) throw new Error("AI JSON döndürmedi: " + response.slice(0, 200));
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(repaired);
  }
}

export interface PlanInput {
  columns: string[];
  sample: Record<string, unknown>[];
  rowCount: number;
  instruction: string;
  config: ProviderConfig;
}

export async function requestPlan(input: PlanInput): Promise<CleaningPlan> {
  const prompt = `Columns: ${JSON.stringify(input.columns)}
Total rows: ${input.rowCount}
Sample rows (up to 20):
${JSON.stringify(input.sample, null, 2)}

User instruction:
${input.instruction}`;

  const content = await callProvider(input.config, SYSTEM, prompt);
  return PlanSchema.parse(extractJson(content));
}

async function callProvider(cfg: ProviderConfig, system: string, user: string): Promise<string> {
  const model = cfg.model || DEFAULT_MODELS[cfg.provider];

  if (cfg.provider === "lovable") {
    return openAiCompatible({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Lovable-API-Key": cfg.apiKey },
      model,
      system,
      user,
    });
  }

  if (cfg.provider === "openai") {
    return openAiCompatible({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      model,
      system,
      user,
    });
  }

  if (cfg.provider === "ollama") {
    const base = (cfg.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    return openAiCompatible({
      url: `${base}/v1/chat/completions`,
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
      model,
      system,
      user,
    });
  }

  if (cfg.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  if (cfg.provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { content?: Array<{ text?: string }> };
    return j.content?.map((c) => c.text ?? "").join("") ?? "";
  }

  throw new Error("Unknown provider");
}

async function openAiCompatible(opts: {
  url: string;
  headers: Record<string, string>;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}