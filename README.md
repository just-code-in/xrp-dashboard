# XRPDash

## What this is

A Next.js dashboard for monitoring XRP price action, ecosystem news, regulatory developments, selected social/X posts, and curated Polymarket signals.

This is a standalone web app originally built in Coral/OpenClaw and then packaged so it can be:

- run locally,
- deployed to Vercel or another Node host,
- committed directly into a GitHub repository.

## Features

- **Real-time XRP stats**
  - current price
  - 24h change
  - market cap
  - 24h volume
  - intraday and 7-day charts

- **News feed**
  - XRP / Ripple / CLARITY Act / RLUSD relevant articles

- **Regulatory & legal watch**
  - curated watchlist for the XRP / Ripple ecosystem

- **Social/X section**
  - optional proxy-backed social feed integration

- **Prediction markets**
  - curated Polymarket markets with noisy price-level spam filtered down

## Tech stack

- Next.js
- React
- TypeScript
- App Router

## Project structure

```text
xrp-dashboard/
├── public/
├── src/
│   └── app/
│       ├── api/
│       │   ├── diag/
│       │   ├── ledger/
│       │   ├── markets/
│       │   ├── news/
│       │   ├── regulatory/
│       │   ├── social/
│       │   └── xrp/
│       ├── globals.css
│       ├── layout.tsx
│       └── page.tsx
├── package.json
├── package-lock.json
├── next.config.ts
└── README.md
```

## Run locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production build

```bash
npm run build
npm start
```

## Environment variables

Most of the dashboard uses public APIs and will work without secrets.

### Optional social/X integration

The social feed route was designed to use a proxy in the Coral/OpenClaw environment.
If these are missing, that part of the dashboard may return empty results.

Create a `.env.local` file if needed:

```bash
CORAL_PROXY_URL=https://your-proxy.example.com
CORAL_PROXY_TOKEN=your-token-here
```

## Deployment

### Option A — Vercel

1. Create a new GitHub repo
2. Push this project to the repo
3. Import the repo into Vercel
4. Set any needed environment variables
5. Deploy

### Option B — Any Node host

```bash
npm install
npm run build
npm start
```

## GitHub setup

If you want to create a new GitHub repo manually:

```bash
git init
git add .
git commit -m "Initial commit: XRP dashboard"
```

Then connect your remote:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## Notes

- The Polymarket section is intentionally curated to reduce junky XRP price-level spam.
- Some surrounding automations in the original OpenClaw environment (cron, Notion, Telegram delivery) are **not required** for the dashboard itself.
- If you want, this app can be further cleaned up into a more public open-source repo structure.

## Suggested next improvements

- add screenshots to README
- add `.env.example`
- add deployment badge / live demo link
- split data-source configuration into a dedicated config file
- add tests for market filtering
