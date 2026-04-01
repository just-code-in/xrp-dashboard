import { NextResponse } from 'next/server';

export interface RegulatoryItem {
  id: string;
  label: string;
  status: 'positive' | 'warning' | 'neutral' | 'watch';
  statusText: string;
  direction: string;
  detail: string;
  lastUpdated: string;
}

export interface RegulatoryNews {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: number;
  category: 'sec' | 'cftc' | 'legislation' | 'international' | 'product';
}

// Static watchlist — updated via code when status changes
const WATCHLIST: RegulatoryItem[] = [
  {
    id: 'sec-case',
    label: 'SEC vs. Ripple',
    status: 'warning',
    statusText: 'Remedies Phase',
    direction: '⚠️ Neutral/Improving',
    detail: 'Partial resolution in place. Remedies phase determines final fine & restrictions. Low fine is base case given current regulatory climate. Watch for any attempt to re-litigate programmatic sales ruling.',
    lastUpdated: 'Mar 2026',
  },
  {
    id: 'rlusd-standing',
    label: 'RLUSD Regulatory Standing',
    status: 'positive',
    statusText: 'SEC 2% Haircut Win',
    direction: '✅ Positive',
    detail: 'SEC confirmed broker-dealers may apply 2% haircut (down from 100%) on proprietary payment stablecoin positions. RLUSD qualifies as issued by state-regulated trust company. Removes key balance-sheet barrier to institutional adoption. Guidance valid until GENIUS Act takes effect.',
    lastUpdated: 'Feb 2026',
  },
  {
    id: 'cftc',
    label: 'CFTC Commodity Classification',
    status: 'positive',
    statusText: 'Framework Advancing',
    direction: '✅ Positive',
    detail: 'RLUSD cleared by CFTC for expanded market use. Crypto framework expected Q1 2026. XRP\'s treatment as commodity (not security) would be a structural positive for institutional participation.',
    lastUpdated: 'Feb 2026',
  },
  {
    id: 'etf',
    label: 'XRP ETF Ecosystem',
    status: 'positive',
    statusText: '$1.1B+ AUM',
    direction: '✅ Positive',
    detail: 'Multiple SEC-approved XRP ETFs live in US market. Bitwise fund leads. Kurv XRP Enhanced Income ETF approved, launching March 11. Institutional on-ramp is now operational infrastructure.',
    lastUpdated: 'Mar 2026',
  },
  {
    id: 'mica',
    label: 'EU MiCA Compliance',
    status: 'positive',
    statusText: 'Registration Pursuing',
    direction: '✅ Positive',
    detail: 'XRPL well-positioned under MiCA framework. Ripple pursuing formal registration. First MiCA enforcement actions expected mid-2026 — Ripple\'s registration status matters for European institutional clients.',
    lastUpdated: 'Mar 2026',
  },
  {
    id: 'genius-act',
    label: 'GENIUS Act (Stablecoin Bill)',
    status: 'watch',
    statusText: 'Advancing in Senate',
    direction: '🔵 Watch',
    detail: 'Stablecoin legislation advancing. RLUSD structured to qualify under GENIUS Act. Watch for amendment language around foreign issuer restrictions — relevant to Ripple\'s global operations. Passage would create federal framework superseding state-by-state money transmitter licenses.',
    lastUpdated: 'Mar 2026',
  },
  {
    id: 'cbdc',
    label: 'Central Bank Partnerships',
    status: 'neutral',
    statusText: 'Active Pilots',
    direction: '🔵 Watch',
    detail: 'Ripple has active CBDC infrastructure pilots in multiple jurisdictions. Any announced production deployment would be a significant signal for institutional adoption and XRPL utility.',
    lastUpdated: 'Mar 2026',
  },
  {
    id: 'xrpl-amm',
    label: 'XRPL DeFi / AMM Activity',
    status: 'neutral',
    statusText: 'Emerging Grey Zone',
    direction: '⚠️ Monitor',
    detail: 'Institutional adoption of on-chain AMM liquidity mechanisms increasing. Regulatory treatment of automated market makers on permissioned-adjacent ledgers is an emerging grey zone under both SEC and CFTC frameworks.',
    lastUpdated: 'Mar 2026',
  },
];

async function fetchRegulatoryNews(): Promise<RegulatoryNews[]> {
  const results: RegulatoryNews[] = [];
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const KEYWORDS = ['xrp', 'ripple', 'rlusd', 'genius act', 'clarity act', 'xrpl', 'sec ripple', 'cftc crypto'];

  const RSS_FEEDS = [
    {
      url: 'https://cointelegraph.com/rss/tag/ripple',
      source: 'CoinTelegraph',
      category: 'sec' as const,
    },
    {
      url: 'https://cointelegraph.com/rss/tag/regulation',
      source: 'CoinTelegraph',
      category: 'legislation' as const,
    },
    {
      url: 'https://decrypt.co/feed',
      source: 'Decrypt',
      category: 'sec' as const,
    },
  ];

  await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'XRPWatch/1.0' },
          next: { revalidate: 300 },
        });
        if (!res.ok) return;
        const text = await res.text();

        const items = text.match(/<item[\s\S]*?<\/item>/gi) || [];
        for (const item of items.slice(0, 20)) {
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
            item.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
          const link = (item.match(/<link>(.*?)<\/link>/i) ||
            item.match(/<guid[^>]*>(.*?)<\/guid>/i) || [])[1] || '';
          const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i) ||
            item.match(/<description>(.*?)<\/description>/i) || [])[1] || '';
          const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1] || '';

          const titleLower = title.toLowerCase();
          const descLower = desc.toLowerCase();
          const combined = titleLower + ' ' + descLower;

          if (!KEYWORDS.some(k => combined.includes(k))) continue;

          const ts = pubDate ? new Date(pubDate).getTime() : now;
          if (ts < now - sevenDays) continue;

          const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 200);

          // Determine category
          let category: RegulatoryNews['category'] = feed.category;
          if (combined.includes('genius') || combined.includes('clarity act') || combined.includes('stablecoin bill')) category = 'legislation';
          else if (combined.includes('mica') || combined.includes('europe') || combined.includes('eu')) category = 'international';
          else if (combined.includes('rlusd') || combined.includes('etf') || combined.includes('xrpl')) category = 'product';
          else if (combined.includes('cftc')) category = 'cftc';
          else if (combined.includes('sec')) category = 'sec';

          results.push({
            id: link || title,
            title: title.trim(),
            summary: cleanDesc,
            url: link.trim(),
            source: feed.source,
            publishedAt: ts,
            category,
          });
        }
      } catch {
        // Feed failed — skip silently
      }
    })
  );

  // Deduplicate by URL, sort newest first
  const seen = new Set<string>();
  return results
    .filter(r => r.url && !seen.has(r.url) && seen.add(r.url))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 15);
}

export async function GET() {
  const [news] = await Promise.all([fetchRegulatoryNews()]);
  return NextResponse.json({
    watchlist: WATCHLIST,
    news,
    generatedAt: Date.now(),
  });
}
