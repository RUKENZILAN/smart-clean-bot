import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const PlanSchema = z.object({
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

const InputSchema = z.object({
  columns: z.array(z.string()),
  sample: z.array(z.record(z.string(), z.any())),
  rowCount: z.number(),
  instruction: z.string(),
});

export const planCleaning = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CleaningPlan> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are a data cleaning assistant. Given a dataset preview and a user request (which may be in any language, often Turkish), produce a cleaning plan as structured JSON.

Rules:
- Only use column names that exist in the provided columns list.
- Choose appropriate actions per column based on what the user wants.
- Actions:
  * trim/lowercase/uppercase: string normalization
  * to_number: parse messy numbers (strips currency symbols, thousand separators)
  * to_date: parse dates to ISO YYYY-MM-DD
  * fill_mean/fill_median: numeric column missing-value fill
  * fill_mode: most frequent value fill (any column)
  * fill_value: fill missing with provided 'value'
  * drop_empty_rows: column with no value -> drop row
  * remove_duplicates: remove duplicate rows based on this column
- If user asks for a chart/summary/graph, set 'chart' with the right type, x (category/date column), y (numeric column), and aggregation. Otherwise null.
- Summary: 1-3 short sentences in the same language as the user's instruction explaining what you'll do.`;

    const prompt = `Columns: ${JSON.stringify(data.columns)}
Total rows: ${data.rowCount}
Sample rows (up to 20):
${JSON.stringify(data.sample, null, 2)}

User instruction:
${data.instruction}`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: system + "\n\nRespond ONLY with valid minified JSON matching this TypeScript type, no markdown, no commentary:\n{summary:string; operations:Array<{column:string; action:'trim'|'lowercase'|'uppercase'|'to_number'|'to_date'|'fill_mean'|'fill_median'|'fill_mode'|'fill_value'|'drop_empty_rows'|'remove_duplicates'; value?:string}>; chart:null|{type:'bar'|'line'|'pie'; xColumn:string; yColumn:string; aggregation:'sum'|'avg'|'count'; title:string}}",
      prompt,
    });

    const parsed = extractJson(text);
    return PlanSchema.parse(parsed);
  });

function extractJson(response: string): unknown {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openChar = start !== -1 ? cleaned[start] : "";
  const endChar = openChar === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(endChar);
  if (start === -1 || end === -1) throw new Error("AI did not return JSON: " + response.slice(0, 200));
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(repaired);
  }
}