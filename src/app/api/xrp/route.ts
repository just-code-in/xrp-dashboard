import { NextResponse } from 'next/server';

// Fetches XRP data from CoinGecko (free, no key needed)
export async function GET() {
  try {
    const [priceRes, sevenDayRes, oneDayRes] = await Promise.all([
      fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true',
        { next: { revalidate: 60 } }
      ),
      fetch(
        'https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=7&interval=daily',
        { next: { revalidate: 300 } }
      ),
      fetch(
        'https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=1',
        { next: { revalidate: 60 } }
      ),
    ]);

    const priceData = await priceRes.json();
    const sevenDay = await sevenDayRes.json();
    const oneDay = await oneDayRes.json();

    const xrp = priceData.ripple;

    // Intraday: ~5-min resolution for past 24h
    const intraday24hPrices: [number, number][] = oneDay.prices || [];
    const intraday24hVolumes: [number, number][] = oneDay.total_volumes || [];

    // Compute 24h high/low from intraday
    const intradayValues = intraday24hPrices.map((p: [number, number]) => p[1]);
    const high24h = intradayValues.length ? Math.max(...intradayValues) : null;
    const low24h = intradayValues.length ? Math.min(...intradayValues) : null;

    return NextResponse.json({
      price: xrp.usd,
      change24h: xrp.usd_24h_change,
      volume24h: xrp.usd_24h_vol,
      marketCap: xrp.usd_market_cap,
      lastUpdated: xrp.last_updated_at,
      high24h,
      low24h,
      // Mini sparklines — intraday (24h, ~5-min resolution)
      intraday24hPrices,
      intraday24hVolumes,
      // Full charts — 7-day daily
      priceHistory: sevenDay.prices || [],
      volumeHistory: sevenDay.total_volumes || [],
    });
  } catch (err) {
    console.error('XRP fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch XRP data' }, { status: 500 });
  }
}
