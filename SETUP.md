# Setup Guide

## Anthropic API Key Configuration

The ECG Analyser uses the Anthropic Claude API. The API key is handled **server-side only** via a Vercel serverless function at `/api/anthropic`, so it is never exposed to the browser.

### Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
3. Run the dev server:
   ```bash
   npm install
   npm run dev
   ```

### Vercel Deployment

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project → **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key
   - **Environment:** Production (and Preview if needed)
4. Redeploy the project

### GitHub Actions

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Set:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key
