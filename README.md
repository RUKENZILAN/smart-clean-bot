# CleanCSV

AI-powered CSV & Excel cleaner that runs entirely in the browser. Drop in a messy spreadsheet, describe what you want fixed in plain language (Turkish or English), and download the cleaned result.

CleanCSV / Tarayıcıda çalışan, yapay zeka destekli CSV ve Excel temizleme aracı. Dosyanızı bırakın, ne istediğinizi yazın, temizlenmiş veriyi indirin.

## Features

- Parse CSV and Excel (`.xlsx`, `.xls`) files locally — data never leaves your browser
- Bring your own OpenAI-compatible API key (stored in `localStorage` only)
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

1. Paste your OpenAI-compatible API key (get one at platform.openai.com)
2. Drop or select a CSV / Excel file
3. Describe what to clean in the instruction box
4. Review the AI plan and cleaned preview
5. Download the result

## License

MIT