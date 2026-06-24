import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { planCleaning, type CleaningPlan } from "@/lib/clean.functions";
import { applyPlan, buildChartData, parseNumber, type Row } from "@/lib/clean-apply";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Upload, Sparkles, Download, FileSpreadsheet, Loader2, Wand2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Veri Temizleyici — AI ile CSV & Excel temizleme" },
      {
        name: "description",
        content:
          "Karmaşık CSV ve Excel dosyalarını yapay zeka ile saniyeler içinde temizle, dönüştür ve görselleştir.",
      },
      { property: "og:title", content: "Veri Temizleyici" },
      { property: "og:description", content: "AI destekli veri temizleme ve hızlı analiz." },
    ],
  }),
  component: Index,
});

const CHART_COLORS = ["#06b6d4", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function Index() {
  const plan = useServerFn(planCleaning);
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
      toast.success(`${rows.length} satır, ${cols.length} sütun yüklendi`);
    } catch (e) {
      toast.error("Dosya okunamadı: " + (e as Error).message);
    }
  }

  async function runClean() {
    if (!rawRows.length) {
      toast.error("Önce bir dosya yükle");
      return;
    }
    if (!instruction.trim()) {
      toast.error("Ne yapmamı istediğini yaz");
      return;
    }
    setLoading(true);
    try {
      const sample = rawRows.slice(0, 20);
      const result = await plan({
        data: { columns, sample, rowCount: rawRows.length, instruction },
      });
      setPlanResult(result);
      const { rows, log: applyLog } = applyPlan(rawRows, result);
      setCleanedRows(rows);
      setLog(applyLog);
      toast.success("Temizleme tamamlandı");
    } catch (e) {
      const msg = (e as Error).message || "Hata";
      if (msg.includes("429")) toast.error("İstek limiti aşıldı, biraz bekle");
      else if (msg.includes("402")) toast.error("AI kredisi bitti. Çalışma alanı ayarlarından kredi ekleyebilirsin.");
      else toast.error("AI hatası: " + msg);
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
            <h1 className="text-lg font-semibold tracking-tight">Veri Temizleyici</h1>
            <p className="text-xs text-muted-foreground">AI ile CSV & Excel temizleme · analiz · grafik</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
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
                {fileName ?? "CSV veya Excel dosyası bırak / seç"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">.csv, .xlsx, .xls desteklenir</p>
            </div>

            {stats && (
              <div className="md:w-64 grid grid-cols-3 md:grid-cols-1 gap-3">
                <Stat label="Satır" value={stats.rows.toLocaleString()} />
                <Stat label="Sütun" value={stats.cols.toString()} />
                <Stat label="Boş hücre" value={stats.emptyPct.toFixed(1) + "%"} />
              </div>
            )}
          </div>
        </Card>

        {/* Instruction */}
        {rawRows.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-medium">Ne yapmamı istersin?</h2>
            </div>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="Örn: Tarih formatlarını düzelt, boş satırları doldur, müşteri harcamalarının grafiğini çıkar"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                AI yalnızca veri yapısının önizlemesini (ilk 20 satır + sütun adları) görür.
              </p>
              <Button onClick={runClean} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Temizleniyor...
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" /> Temizle & Analiz Et
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
              <h2 className="font-medium mb-2">AI'nın planı</h2>
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
                  {cleanedRows ? "Temizlenmiş veri" : "Önizleme"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  İlk {previewRows.length} satır gösteriliyor
                  {cleanedRows ? ` · toplam ${cleanedRows.length} satır` : ""}
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
          <div className="text-center text-sm text-muted-foreground py-6">
            Başlamak için bir CSV veya Excel dosyası yükle. Veriler tarayıcında işlenir; AI'ya yalnızca
            küçük bir örnek ve sütun adları gönderilir.
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
