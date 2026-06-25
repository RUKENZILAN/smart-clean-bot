# CleanCSV

AI-powered CSV & Excel cleaner that runs entirely in the browser. Drop in a messy spreadsheet, describe what you want fixed in plain language (Turkish or English), and download the cleaned result.

CleanCSV / Tarayıcıda çalışan, yapay zeka destekli CSV ve Excel temizleme aracı. Dosyanızı bırakın, ne istediğinizi yazın, temizlenmiş veriyi indirin.

Check it out: https://rukenzilan.github.io/smart-clean-bot/

## About

CleanCSV is a privacy-first data cleaning tool built for analysts, researchers, and anyone tired of wrestling with messy spreadsheets. Instead of writing pandas scripts or hunting through Excel menus, you just drop in your file, describe what you want in plain language ("trim whitespace from names", "convert dates to ISO format", "fill empty city cells with Unknown"), and let an AI model produce a clean, downloadable result.

Everything runs in your browser — your CSV or Excel file is parsed locally with `papaparse` and `xlsx`, and the AI provider you choose is called directly from the client using your own API key. No backend, no upload server, no data retention. If you'd rather not send anything to a third party at all, plug in a local **Ollama** model and the entire pipeline stays on your machine.

You stay in control of cost and model choice: pick **Lovable AI Gateway** for zero-setup access, **Gemini / Claude / OpenAI** to use a provider you already pay for, or **Ollama** for fully offline cleaning. Switch providers at any time from the dropdown — keys and model preferences are remembered per provider in `localStorage`.


## Features

- Parse CSV and Excel (`.xlsx`, `.xls`) files locally — data never leaves your browser
- **Multi-provider AI** — choose your own backend:
  - Lovable AI Gateway
  - Google Gemini (AI Studio)
  - Anthropic Claude
  - OpenAI
  - Ollama (run models locally, no API key needed)
- API keys are stored only in your browser's `localStorage`
- Natural language instructions: fix dates, fill blanks, normalize columns, etc.
- Preview cleaned data before downloading
- Bilingual UI (Türkçe / English)

## Tech Stack

- React 19 + TypeScript + Vite
- TanStack Start (dev) / standalone static build (GitHub Pages)
- Tailwind CSS v4 + shadcn/ui
- `papaparse`, `xlsx`, Vercel AI SDK

## Development

```bash
bun install
bun run dev
```

## Build

- `bun run build` — TanStack Start build
- `bun run build:gh` — standalone static build for GitHub Pages (outputs to `dist/`)
- `bun run preview:gh` — preview the static build locally

## Deploy to GitHub Pages

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `build:gh` and publishes `dist/` to GitHub Pages. Enable Pages in your repo settings with the source set to **GitHub Actions**.

## Usage

1. Pick an AI provider and paste the matching API key:
   - **Lovable AI** → https://lovable.dev/settings/workspace
   - **Gemini** → https://aistudio.google.com/apikey
   - **Claude** → https://console.anthropic.com/settings/keys
   - **OpenAI** → https://platform.openai.com/api-keys
   - **Ollama** → start it locally with `OLLAMA_ORIGINS="*" ollama serve` (no key required)
2. Optionally override the model name (defaults are filled in per provider).
3. Drop or select a CSV / Excel file.
4. Describe what to clean in the instruction box.
5. Review the AI plan and cleaned preview, then download the result.

> **Note on Claude:** the browser calls the Anthropic API directly using the
> `anthropic-dangerous-direct-browser-access` header. This is fine for personal
> use but you should put a proxy in front of it for production.

## License

MIT
