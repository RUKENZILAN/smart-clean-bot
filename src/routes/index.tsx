import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { requestPlan, type CleaningPlan } from "@/lib/clean-ai";
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  type Provider,
  type ProviderConfig,
} from "@/lib/clean-ai";
import { applyPlan, buildChartData, parseNumber, type Row } from "@/lib/clean-apply";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Upload, Sparkles, Download, FileSpreadsheet, Loader2, Wand2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CleanCSV — AI ile CSV & Excel temizleme" },
      {
        name: "description",
        content:
          "CleanCSV: karmaşık CSV ve Excel dosyalarını yapay zeka ile saniyeler içinde temizle, dönüştür ve görselleştir.",
      },
      { property: "og:title", content: "CleanCSV" },
      { property: "og:description", content: "AI destekli CSV & Excel temizleme ve hızlı analiz." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smart-clean-bot.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://smart-clean-bot.lovable.app/" }],
  }),
  component: Index,
});

const CHART_COLORS = ["#06b6d4", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function Index() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [cleanedRows, setCleanedRows] = useState<Row[] | null>(null);
  const [instruction, setInstruction] = useState(
    "Tarih sütunlarını YYYY-MM-DD formatına çevir, sayısal sütunlardaki boş hücreleri ortalamayla doldur, tekrar eden satırları sil. Müşteri harcamalarının özet grafiğini çıkar.",
  );
  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState<CleaningPlan | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider>("lovable");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.lovable);
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");

  useEffect(() => {
    const p = (localStorage.getItem("ai_provider") as Provider) || "lovable";
    setProvider(p);
    setApiKey(localStorage.getItem(`ai_key_${p}`) ?? "");
    setModel(localStorage.getItem(`ai_model_${p}`) ?? DEFAULT_MODELS[p]);
    setBaseUrl(localStorage.getItem("ai_ollama_url") ?? "http://localhost:11434");
  }, []);

  function changeProvider(p: Provider) {
    setProvider(p);
    localStorage.setItem("ai_provider", p);
    const savedKey = localStorage.getItem(`ai_key_${p}`) ?? "";
    const savedModel = localStorage.getItem(`ai_model_${p}`) ?? DEFAULT_MODELS[p];
    setApiKey(savedKey);
    setModel(savedModel);
  }

  function saveKey(v: string) {
    setApiKey(v);
    if (v) localStorage.setItem(`ai_key_${provider}`, v);
    else localStorage.removeItem(`ai_key_${provider}`);
  }

  function saveModel(v: string) {
    setModel(v);
    if (v) localStorage.setItem(`ai_model_${provider}`, v);
  }

  function saveBaseUrl(v: string) {
    setBaseUrl(v);
    localStorage.setItem("ai_ollama_url", v);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setCleanedRows(null);
    setPlanResult(null);
    setLog([]);
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let rows: Row[] = [];
      let cols: string[] = [];
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: false, dynamicTyping: false });
        rows = parsed.data as Row[];
        cols = parsed.meta.fields ?? [];
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true });
        cols = rows.length ? Object.keys(rows[0]) : [];
      }
      setColumns(cols);
      setRawRows(rows);
      toast.success(`${rows.length} satır / rows, ${cols.length} sütun / columns`);
    } catch (e) {
      toast.error("Dosya okunamadı / Could not read file: " + (e as Error).message);
    }
  }

  async function runClean() {
    if (!rawRows.length) {
      toast.error("Önce bir dosya yükle / Upload a file first");
      return;
    }
    if (!instruction.trim()) {
      toast.error("Talimat yaz / Write an instruction");
      return;
    }
    if (provider !== "ollama" && !apiKey.trim()) {
      toast.error("API anahtarını gir / Enter your API key");
      return;
    }
    setLoading(true);
    try {
      const sample = rawRows.slice(0, 20);
      const config: ProviderConfig = {
        provider,
        apiKey: apiKey.trim(),
        model: model.trim() || DEFAULT_MODELS[provider],
        baseUrl: baseUrl.trim(),
      };
      const result = await requestPlan({
        columns,
        sample,
        rowCount: rawRows.length,
        instruction,
        config,
      });
      setPlanResult(result);
      const { rows, log: applyLog } = applyPlan(rawRows, result);
      setCleanedRows(rows);
      setLog(applyLog);
      toast.success("Temizleme tamamlandı / Cleaning complete");
    } catch (e) {
      const msg = (e as Error).message || "Hata";
      if (msg.includes("429")) toast.error("İstek limiti aşıldı / Rate limit exceeded");
      else if (msg.includes("402")) toast.error("AI kredisi bitti / AI credits exhausted");
      else toast.error("AI hatası / AI error: " + msg);
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!cleanedRows) return;
    const csv = Papa.unparse(cleanedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "cleaned") + "_cleaned.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadXlsx() {
    if (!cleanedRows) return;
    const ws = XLSX.utils.json_to_sheet(cleanedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cleaned");
    XLSX.writeFile(wb, (fileName?.replace(/\.[^.]+$/, "") ?? "cleaned") + "_cleaned.xlsx");
  }

  const previewRows = (cleanedRows ?? rawRows).slice(0, 50);
  const previewCols = cleanedRows ? Object.keys(cleanedRows[0] ?? {}) : columns;
  const stats = useMemo(() => {
    if (!rawRows.length) return null;
    let emptyCells = 0;
    let total = 0;
    for (const r of rawRows) {
      for (const c of columns) {
        total++;
        const v = r[c];
        if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) emptyCells++;
      }
    }
    return { rows: rawRows.length, cols: columns.length, emptyPct: total ? (emptyCells / total) * 100 : 0 };
  }, [rawRows, columns]);

  const chartData = useMemo(() => {
    if (!cleanedRows || !planResult?.chart) return null;
    return buildChartData(cleanedRows, planResult.chart);
  }, [cleanedRows, planResult]);

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wand2 className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">CleanCSV</h1>
            <p className="text-xs text-muted-foreground">
              AI ile CSV & Excel temizleme · analiz · grafik
              <br />
              <span className="opacity-70">AI-powered CSV & Excel cleaning · analysis · charts</span>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {/* API Key */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            <span className="text-sm font-medium">AI Sağlayıcı / Provider</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Select value={provider} onValueChange={(v) => changeProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "API key (opsiyonel / optional)"
                  : "API key (tarayıcıda saklanır / stored in your browser only)"
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={model}
              onChange={(e) => saveModel(e.target.value)}
              placeholder={`Model (örn / e.g. ${DEFAULT_MODELS[provider]})`}
            />
            {provider === "ollama" && (
              <Input
                value={baseUrl}
                onChange={(e) => saveBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            )}
            {provider !== "ollama" && (
              <a
                href={
                  provider === "lovable"
                    ? "https://lovable.dev/settings/workspace"
                    : provider === "gemini"
                    ? "https://aistudio.google.com/apikey"
                    : provider === "claude"
                    ? "https://console.anthropic.com/settings/keys"
                    : "https://platform.openai.com/api-keys"
                }
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline self-center"
              >
                {PROVIDER_LABELS[provider]} anahtarı al / Get API key →
              </a>
            )}
          </div>
          {provider === "claude" && (
            <p className="text-xs text-muted-foreground">
              ⚠️ Claude tarayıcıdan doğrudan çağrılır (CORS gerektirir). Üretimde proxy kullan.
              <br />
              <span className="opacity-70">Claude is called directly from the browser (requires CORS). Use a proxy in production.</span>
            </p>
          )}
          {provider === "ollama" && (
            <p className="text-xs text-muted-foreground">
              Ollama'yı <code>OLLAMA_ORIGINS="*" ollama serve</code> ile başlat.
            </p>
          )}
        </Card>

        {/* Upload */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-stretch">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="flex-1 border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {fileName ?? "CSV veya Excel dosyası bırak / Drop or select a CSV or Excel file"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">.csv, .xlsx, .xls desteklenir / supported</p>
            </div>

            {stats && (
              <div className="md:w-64 grid grid-cols-3 md:grid-cols-1 gap-3">
                <Stat label="Satır / Rows" value={stats.rows.toLocaleString()} />
                <Stat label="Sütun / Columns" value={stats.cols.toString()} />
                <Stat label="Boş hücre / Empty" value={stats.emptyPct.toFixed(1) + "%"} />
              </div>
            )}
          </div>
        </Card>

        {/* Instruction */}
        {rawRows.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-medium">Ne yapmamı istersin? / What should I do?</h2>
            </div>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="Örn / e.g.: Tarih formatlarını düzelt, boş satırları doldur, müşteri harcamalarının grafiğini çıkar — Fix date formats, fill empty rows, chart customer spending"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                AI yalnızca ilk 20 satır + sütun adlarını görür.
                <br />
                <span className="opacity-70">AI only sees the first 20 rows + column names.</span>
              </p>
              <Button onClick={runClean} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Temizleniyor / Cleaning...
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" /> Temizle & Analiz / Clean & Analyze
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Plan + log */}
        {planResult && (
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="font-medium mb-2">AI'nın planı / AI plan</h2>
              <p className="text-sm text-muted-foreground">{planResult.summary}</p>
            </div>
            {planResult.operations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {planResult.operations.map((op, i) => (
                  <Badge key={i} variant="secondary" className="font-normal">
                    {op.column} → {op.action}
                    {op.value ? `: ${op.value}` : ""}
                  </Badge>
                ))}
              </div>
            )}
            {log.length > 0 && (
              <ul className="text-sm space-y-1 border-l-2 border-primary/30 pl-4">
                {log.map((l, i) => (
                  <li key={i} className="text-muted-foreground">
                    ✓ {l}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Chart */}
        {chartData && planResult?.chart && chartData.length > 0 && (
          <Card className="p-6 space-y-4">
            <h2 className="font-medium">{planResult.chart.title}</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {planResult.chart.type === "bar" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : planResult.chart.type === "line" ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} />
                  </LineChart>
                ) : (
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={110} label>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Preview Table */}
        {previewRows.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-medium">
                  {cleanedRows ? "Temizlenmiş veri / Cleaned data" : "Önizleme / Preview"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  İlk / First {previewRows.length} satır / rows
                  {cleanedRows ? ` · toplam / total ${cleanedRows.length}` : ""}
                </p>
              </div>
              {cleanedRows && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadCsv}>
                    <Download className="size-4" /> CSV
                  </Button>
                  <Button size="sm" onClick={downloadXlsx}>
                    <FileSpreadsheet className="size-4" /> Excel
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-auto border rounded-lg max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    {previewCols.map((c) => (
                      <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap border-b">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                      {previewCols.map((c) => {
                        const v = r[c];
                        const empty = v === null || v === undefined || v === "";
                        return (
                          <td
                            key={c}
                            className={
                              "px-3 py-1.5 whitespace-nowrap " +
                              (empty ? "text-muted-foreground/50 italic" : "")
                            }
                          >
                            {empty ? "—" : String(v instanceof Date ? v.toISOString().slice(0, 10) : v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {!rawRows.length && (
          <div className="text-center text-sm text-muted-foreground py-6 space-y-1">
            <p>Başlamak için bir CSV veya Excel dosyası yükle. Veriler tarayıcıda işlenir; AI'ya yalnızca küçük bir örnek ve sütun adları gönderilir.</p>
            <p className="opacity-70">Upload a CSV or Excel file to start. Data is processed in your browser; only a small sample and column names are sent to the AI.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

// Avoid tree-shaking the helper while keeping public API clean
void parseNumber;
