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
  apiKey: string;
  model?: string;
}

export async function requestPlan(input: PlanInput): Promise<CleaningPlan> {
  const prompt = `Columns: ${JSON.stringify(input.columns)}
Total rows: ${input.rowCount}
Sample rows (up to 20):
${JSON.stringify(input.sample, null, 2)}

User instruction:
${input.instruction}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": input.apiKey,
    },
    body: JSON.stringify({
      model: input.model ?? "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  return PlanSchema.parse(extractJson(content));
}