import type { CleaningPlan } from "./clean.functions";

export type Row = Record<string, unknown>;

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.\-]/g, "");
  // Handle 1.234,56 vs 1,234.56
  let normalized = s;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  }
  const n = parseFloat(normalized);
  return isFinite(n) ? n : null;
}

function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Try YYYY-MM-DD / ISO first
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    d = new Date(Number(yy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function applyPlan(rowsIn: Row[], plan: CleaningPlan): { rows: Row[]; log: string[] } {
  let rows = rowsIn.map((r) => ({ ...r }));
  const log: string[] = [];

  for (const op of plan.operations) {
    const col = op.column;
    const before = rows.length;
    switch (op.action) {
      case "trim":
        rows.forEach((r) => {
          if (typeof r[col] === "string") r[col] = (r[col] as string).trim();
        });
        log.push(`"${col}" sütunundaki boşluklar temizlendi`);
        break;
      case "lowercase":
        rows.forEach((r) => {
          if (typeof r[col] === "string") r[col] = (r[col] as string).toLowerCase();
        });
        log.push(`"${col}" küçük harfe çevrildi`);
        break;
      case "uppercase":
        rows.forEach((r) => {
          if (typeof r[col] === "string") r[col] = (r[col] as string).toUpperCase();
        });
        log.push(`"${col}" büyük harfe çevrildi`);
        break;
      case "to_number":
        rows.forEach((r) => {
          const n = parseNumber(r[col]);
          r[col] = n === null ? null : n;
        });
        log.push(`"${col}" sayıya dönüştürüldü`);
        break;
      case "to_date":
        rows.forEach((r) => {
          const d = parseDate(r[col]);
          r[col] = d === null ? null : d;
        });
        log.push(`"${col}" tarih formatına (YYYY-MM-DD) dönüştürüldü`);
        break;
      case "fill_mean": {
        const nums = rows.map((r) => parseNumber(r[col])).filter((n): n is number => n !== null);
        if (nums.length) {
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          rows.forEach((r) => {
            if (isEmpty(r[col])) r[col] = Math.round(mean * 100) / 100;
          });
          log.push(`"${col}" boş hücreler ortalama (${mean.toFixed(2)}) ile dolduruldu`);
        }
        break;
      }
      case "fill_median": {
        const nums = rows
          .map((r) => parseNumber(r[col]))
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b);
        if (nums.length) {
          const mid = Math.floor(nums.length / 2);
          const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
          rows.forEach((r) => {
            if (isEmpty(r[col])) r[col] = median;
          });
          log.push(`"${col}" boş hücreler medyan (${median}) ile dolduruldu`);
        }
        break;
      }
      case "fill_mode": {
        const counts = new Map<string, number>();
        rows.forEach((r) => {
          if (!isEmpty(r[col])) {
            const k = String(r[col]);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        });
        let mode: string | null = null;
        let max = 0;
        for (const [k, v] of counts) if (v > max) ((max = v), (mode = k));
        if (mode !== null) {
          rows.forEach((r) => {
            if (isEmpty(r[col])) r[col] = mode;
          });
          log.push(`"${col}" boş hücreler en sık değer ("${mode}") ile dolduruldu`);
        }
        break;
      }
      case "fill_value":
        rows.forEach((r) => {
          if (isEmpty(r[col])) r[col] = op.value ?? "";
        });
        log.push(`"${col}" boş hücreler "${op.value ?? ""}" ile dolduruldu`);
        break;
      case "drop_empty_rows":
        rows = rows.filter((r) => !isEmpty(r[col]));
        log.push(`"${col}" boş olan ${before - rows.length} satır silindi`);
        break;
      case "remove_duplicates": {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const k = String(r[col]);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        log.push(`"${col}" baz alınarak ${before - rows.length} tekrarlı satır silindi`);
        break;
      }
    }
  }

  return { rows, log };
}

export function buildChartData(
  rows: Row[],
  chart: NonNullable<CleaningPlan["chart"]>,
): Array<{ name: string; value: number }> {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const key = r[chart.xColumn];
    if (key === null || key === undefined || key === "") continue;
    const keyStr = String(key);
    const yVal = parseNumber(r[chart.yColumn]);
    const arr = groups.get(keyStr) ?? [];
    if (chart.aggregation === "count") arr.push(1);
    else if (yVal !== null) arr.push(yVal);
    groups.set(keyStr, arr);
  }
  const out: Array<{ name: string; value: number }> = [];
  for (const [name, arr] of groups) {
    if (!arr.length) continue;
    let value = 0;
    if (chart.aggregation === "sum" || chart.aggregation === "count")
      value = arr.reduce((a, b) => a + b, 0);
    else value = arr.reduce((a, b) => a + b, 0) / arr.length;
    out.push({ name, value: Math.round(value * 100) / 100 });
  }
  // Sort: if date-like keys, ascending; else by value desc, top 20
  const looksDate = out.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.name));
  if (looksDate) out.sort((a, b) => a.name.localeCompare(b.name));
  else out.sort((a, b) => b.value - a.value);
  return out.slice(0, 30);
}

function parseNumberHelper(v: unknown): number | null {
  return parseNumber(v);
}
export { parseNumberHelper as parseNumber };