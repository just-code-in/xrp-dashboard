import { NextResponse } from 'next/server';

// XRP Ledger public data via XRPL.org/Ripple APIs
export async function GET() {
  try {
    // Use xrpscan public API for ledger stats
    const [ledgerRes, txRes] = await Promise.all([
      fetch('https://api.xrpscan.com/api/v1/ledger/stats', { next: { revalidate: 60 } }),
      fetch('https://api.xrpscan.com/api/v1/transaction/stats', { next: { revalidate: 60 } }),
    ]);

    let ledgerStats = null;
    let txStats = null;

    if (ledgerRes.ok) ledgerStats = await ledgerRes.json();
    if (txRes.ok) txStats = await txRes.json();

    return NextResponse.json({ ledgerStats, txStats });
  } catch (err) {
    console.error('Ledger fetch error:', err);
    return NextResponse.json({ ledgerStats: null, txStats: null });
  }
}
