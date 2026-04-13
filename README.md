# ECG AI Analyser

An AI-powered ECG (Electrocardiogram) analysis application that uses the Anthropic Claude Sonnet API to perform a comprehensive 3-stage ECG analysis pipeline.

## Features

- **Emergency Triage** — Rapid assessment for life-threatening conditions (STEMI, VF/VT, complete heart block)
- **Waveform Analysis** — Structured measurement of intervals, morphology, and ST/T-wave changes
- **Clinical Synthesis** — Final consultant-level ECG interpretation with diagnosis and recommendations
- Upload ECG images for instant AI-powered analysis
- Clean, modern UI

## Tech Stack

- **React** (v18) — UI framework
- **Vite** — Build tool and dev server
- **Anthropic Claude API** — AI-powered ECG interpretation

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- An [Anthropic API key](https://console.anthropic.com/)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shivesh2334-ai/ECG.git
   cd ECG
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

The output will be in the `dist/` directory.

## Deploying to Vercel

This project includes a `vercel.json` configuration file for one-click deployment.

### Option 1: One-Click Deploy

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel will auto-detect Vite and deploy.

### Option 2: Vercel CLI

```bash
npm i -g vercel
vercel
```

## ⚠️ Security Note

> **Important:** This app currently calls the Anthropic API directly from the browser. This means your API key would be exposed in client-side code.
>
> **For production use**, set up a server-side proxy (e.g., a Vercel serverless function in `/api`) to forward requests to the Anthropic API so that your API key remains secret.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Your Anthropic Claude API key |

## License

This project is provided as-is for educational and demonstration purposes.
