import { NextResponse } from 'next/server';

interface Article {
  id: string;
  title: string;
  body: string;
  url: string;
  source: string;
  imageUrl: string;
  publishedAt: number;
}

function parseDate(s: string): number {
  try { return new Date(s).getTime(); } catch { return Date.now(); }
}

function between(str: string, open: string, close: string): string {
  const start = str.indexOf(open);
  if (start === -1) return '';
  const end = str.indexOf(close, start + open.length);
  if (end === -1) return '';
  return str.slice(start + open.length, end).trim();
}

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function extractImage(item: string): string {
  const mediaMatch = item.match(/media:content[^>]+url=["']([^"']+)["']/);
  if (mediaMatch) return mediaMatch[1];
  const imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return imgMatch[1];
  return '';
}

function parseRSS(xml: string, sourceName: string): Article[] {
  const articles: Article[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = clean(between(item, '<title>', '</title>'));
    const link =
      item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1] ||
      item.match(/<link>(https?:\/\/[^<\s]+)<\/link>/)?.[1] || '';
    const pubDate =
      between(item, '<pubDate>', '</pubDate>') ||
      between(item, '<atom:updated>', '</atom:updated>');
    const desc = clean(
      between(item, '<description>', '</description>') ||
      between(item, '<content:encoded>', '</content:encoded>')
    );
    const imageUrl = extractImage(item);
    const guid =
      between(item, '<guid isPermaLink="true">', '</guid>') ||
      between(item, '<guid>', '</guid>') || link;

    if (!title || !link) continue;

    articles.push({
      id: guid || link,
      title,
      body: desc.slice(0, 220) + (desc.length > 220 ? '...' : ''),
      url: link.split('?utm_')[0],
      source: sourceName,
      imageUrl,
      publishedAt: parseDate(pubDate),
    });
  }
  return articles;
}

async function fetchRSS(url: string, sourceName: string): Promise<Article[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, sourceName);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const feeds = await Promise.all([
      fetchRSS('https://cointelegraph.com/rss/tag/ripple', 'CoinTelegraph'),
      fetchRSS('https://cointelegraph.com/rss/tag/xrp', 'CoinTelegraph'),
      fetchRSS('https://cointelegraph.com/rss/tag/regulation', 'CoinTelegraph'),
      fetchRSS('https://decrypt.co/feed', 'Decrypt'),
    ]);

    const allArticles = feeds.flat();

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = allArticles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    // Filter to relevant topics
    const keywords = ['xrp', 'ripple', 'clarity act', 'rlusd', 'xrpl', 'ripple payments', 'evernorth', 'xrpn'];
    const filtered = unique.filter(a => {
      const text = (a.title + ' ' + a.body).toLowerCase();
      return keywords.some(k => text.includes(k));
    });

    // ── 7-day filter ──────────────────────────────────────────
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = filtered.filter(a => a.publishedAt >= sevenDaysAgo);

    // Sort newest first, cap at 12
    const sorted = recent
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 12);

    return NextResponse.json({ articles: sorted, cutoffMs: sevenDaysAgo });
  } catch (err) {
    console.error('News fetch error:', err);
    return NextResponse.json({ articles: [] }, { status: 500 });
  }
}
