import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export interface PredictionMarket {
  id: string;
  question: string;
  yesProb: number;
  noProb: number;
  volume24h: number;
  volumeTotal: number;
  endDate: string;
  url: string;
  source: 'Polymarket';
  kind?: 'substantive' | 'price-sentinel'; // price-sentinel = end-of-month / nearest-price picks
  sentinelLabel?: string; // e.g. "End of month · $1.50" or "Nearest level · $1.60"
  strikePrice?: number;   // the $ level being predicted
}

// ─── Keyword tiers ────────────────────────────────────────────────────────────
// Tier 1: high-signal corporate/adoption/regulatory terms
const TIER1 = [
  'ripple labs', 'ripple ipo', 'ripple sec', 'sec vs ripple',
  'rlusd', 'evernorth', 'xrpl', 'genius act', 'fit21',
  'xrp etf', 'xrp reserve', 'xrp strategic',
  'crypto clarity', 'digital asset bill', 'stable act',
];

// Tier 2: broader XRP/Ripple — keep if NOT a price/up-down market
const TIER2 = ['xrp', 'ripple'];

// Patterns that identify pure price-movement markets to exclude
// Covers: "above $X", "below $X", "will price of XRP be above", "hit $X", "reach $X", etc.
const PRICE_LEVEL = /(\babove\b|\bbelow\b|\bhigher than\b|\blower than\b|\bhit\b|\breach\b|\bdip to\b|\bexceed\b|\bbreak\b|\bstay (above|below)\b|\bbetween \$).*\$[\d,.]+/i;
const PRICE_QUESTION = /will (the )?price of .*(be above|be below|exceed|reach|hit|cross|break|stay above|stay below|less than|greater than|be between)/i;
const PRICE_RANGE = /price.*between.*\$/i;
const PRICE_UP_DOWN = /\b(up or down|up\/down|price up|price down|bullish|bearish)\b.*\b(xrp|ripple)\b|\b(xrp|ripple)\b.*(up or down|up\/down|price up|price down)/i;
const TIME_RANGE = /\d{1,2}:\d{2}\s*[ap]m\s*[-–]\s*\d{1,2}:\d{2}\s*[ap]m/i;
const HOURLY_CANDLE = /\b[1-9]\d*(am|pm)\s+et\b/i;
const PRICE_PREDICTION_TITLE = /what price will .* hit/i;
const MARKET_CAP_COMPARE = /higher market cap/i;
// Exclude generic "will XRP be above/below $X on [date]" patterns
const PRICE_ON_DATE = /(xrp|ripple).*(above|below|over|under|at least|at most).*\$[\d.]+.*(on|by|before|after)/i;
// Exception keywords — these are adoption/milestone metrics, not price bets
const ADOPTION_EXCEPTION = /\b(circulation|wallets|addresses|users|transactions|volume|tvl|market makers|listings|integrations|holders)\b/i;

function isNoisyMarket(title: string, description: string): boolean {
  if (TIME_RANGE.test(title + ' ' + description)) return true;  // 5-min candle
  if (HOURLY_CANDLE.test(title)) return true;                   // hourly candle
  if (PRICE_PREDICTION_TITLE.test(title)) return true;          // "What price will XRP hit..."
  if (MARKET_CAP_COMPARE.test(title)) return true;              // "XRP vs Polkadot market cap"
  if (PRICE_QUESTION.test(title)) return true;                  // "Will price of XRP be above..."
  if (PRICE_UP_DOWN.test(title)) return true;                   // "XRP up or down"
  if (PRICE_ON_DATE.test(title)) return true;                   // "XRP above $X on March 24"
  // Price level / range checks — but exempt adoption-milestone markets
  if (!ADOPTION_EXCEPTION.test(title)) {
    if (PRICE_LEVEL.test(title)) return true;                   // "above $1.50", "below $2"
    if (PRICE_RANGE.test(title)) return true;                   // "price between $X and $Y"
  }
  return false;
}

function isRelevantEvent(title: string, description: string): boolean {
  const text = (title + ' ' + description).toLowerCase();
  if (TIER1.some(k => text.includes(k))) return true;
  if (TIER2.some(k => text.includes(k)) && !isNoisyMarket(title, description)) return true;
  return false;
}

async function fetchPage(offset: number): Promise<any[]> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?limit=100&offset=${offset}&order=startDate&ascending=false`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Extract a dollar strike price from a market question, e.g. "above $1.50" → 1.50
function extractStrike(question: string): number | null {
  const m = question.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// Is this market end-of-month (last ~5 days of current month or labelled with month-end date)?
function isEndOfMonth(endDate: string): boolean {
  if (!endDate) return false;
  try {
    const d = new Date(endDate);
    const now = new Date();
    // Same month/year and day >= 25
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() >= 25;
  } catch { return false; }
}

export async function GET() {
  // Get current XRP price for sentinel selection
  let currentPrice = 0;
  try {
    const pr = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd',
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }
    );
    if (pr.ok) {
      const pd = await pr.json();
      currentPrice = pd?.ripple?.usd ?? 0;
    }
  } catch {}

  // Fetch 10 pages in parallel (1000 events)
  const offsets = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const pages = await Promise.all(offsets.map(fetchPage));

  const substantive: PredictionMarket[] = [];
  // Price-level candidates: { market, strike, isEOM }
  const priceCandidates: Array<{ m: PredictionMarket; strike: number; isEOM: boolean }> = [];
  const seen = new Set<string>();

  for (const events of pages) {
    for (const event of events) {
      const eventTitle: string = event.title || event.question || '';
      const desc: string = event.description || '';
      const slug: string = event.slug || String(event.id || '');
      const v24h = parseFloat(event.volume24hr) || 0;
      const volTotal = parseFloat(event.volume) || 0;
      const endDate: string = event.endDate || '';
      const isEOM = isEndOfMonth(endDate);

      const eventIsRelevant = isRelevantEvent(eventTitle, desc);
      // Is this a price-level event (for sentinel harvesting)?
      const isPriceEvent = /\bxrp\b|\bripple\b/i.test(eventTitle) && !eventIsRelevant;

      if (!eventIsRelevant && !isPriceEvent) continue;

      for (const m of (event.markets || [])) {
        const marketId = String(m.id || m.conditionId || m.question_id || '');
        if (!marketId || seen.has(marketId)) continue;
        seen.add(marketId);

        let prices: number[] = [0.5, 0.5];
        try {
          const raw = typeof m.outcomePrices === 'string'
            ? JSON.parse(m.outcomePrices)
            : m.outcomePrices;
          if (Array.isArray(raw)) prices = raw.map(Number);
        } catch {}

        const marketQuestion = m.question || eventTitle;
        const mEndDate = endDate || m.endDate || '';

        const base: PredictionMarket = {
          id: marketId,
          question: marketQuestion,
          yesProb: prices[0] ?? 0.5,
          noProb: prices[1] ?? 0.5,
          volume24h: v24h,
          volumeTotal: volTotal,
          endDate: mEndDate,
          url: `https://polymarket.com/event/${slug}`,
          source: 'Polymarket',
        };

        if (eventIsRelevant && !isNoisyMarket(marketQuestion, '')) {
          substantive.push({ ...base, kind: 'substantive' });
        } else if (isPriceEvent || isNoisyMarket(marketQuestion, '')) {
          // Harvest for sentinel selection — only "above $X" style (single strike)
          const strike = extractStrike(marketQuestion);
          if (strike !== null && /above|exceed|greater than/i.test(marketQuestion)) {
            priceCandidates.push({ m: { ...base, kind: 'price-sentinel' }, strike, isEOM: isEndOfMonth(mEndDate) });
          }
        }
      }
    }
  }

  substantive.sort((a, b) => b.volume24h - a.volume24h || b.volumeTotal - a.volumeTotal);

  // ── Sentinel selection ─────────────────────────────────────────────────────
  // Prefer end-of-month candidates; fallback to any. Pick:
  //   1. The strike closest to (but not necessarily above) current price — "nearest level"
  //   2. The end-of-month level furthest out (latest endDate, most liquid)
  const sentinels: PredictionMarket[] = [];

  if (priceCandidates.length > 0 && currentPrice > 0) {
    // Sort by proximity to current price
    const byProximity = [...priceCandidates].sort(
      (a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
    );
    const nearest = byProximity[0];
    sentinels.push({
      ...nearest.m,
      sentinelLabel: `Nearest level · $${nearest.strike.toFixed(2)}`,
      strikePrice: nearest.strike,
    });

    // End-of-month: pick the EOM candidate with strike closest to current price
    // (different from nearest if nearest isn't EOM)
    const eomCandidates = priceCandidates.filter(c => c.isEOM);
    const eomPool = eomCandidates.length > 0 ? eomCandidates : priceCandidates;
    const eomByProximity = [...eomPool].sort(
      (a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
    );
    const eom = eomByProximity[0];
    // Only add if it's different from nearest
    if (eom && eom.m.id !== nearest.m.id) {
      sentinels.push({
        ...eom.m,
        sentinelLabel: `End of month · $${eom.strike.toFixed(2)}`,
        strikePrice: eom.strike,
      });
    }
  }

  // Final output: up to 2 substantive + up to 2 sentinels, total ≤ 4
  const substantiveSlice = substantive.slice(0, 2);
  const remaining = Math.max(0, 4 - substantiveSlice.length);
  const sentinelSlice = sentinels.slice(0, Math.min(2, remaining));

  const markets = [...substantiveSlice, ...sentinelSlice];

  return NextResponse.json({ markets, currentPrice, asOf: Date.now() });
}
