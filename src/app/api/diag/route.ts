import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const diagnostics: any = { timestamp: Date.now(), env: process.env.VERCEL_REGION || 'unknown' };
  
  try {
    const res = await fetch(
      'https://gamma-api.polymarket.com/events?limit=5&offset=0&order=startDate&ascending=false',
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    diagnostics.status = res.status;
    diagnostics.ok = res.ok;
    if (res.ok) {
      const data = await res.json();
      diagnostics.eventCount = Array.isArray(data) ? data.length : 'not array';
      diagnostics.firstTitle = Array.isArray(data) && data[0] ? data[0].title : 'none';
    }
  } catch (e: any) {
    diagnostics.error = (e as any)?.message || String(e);
  }
  
  return NextResponse.json(diagnostics);
}
