import { NextResponse } from 'next/server';

export interface Tweet {
  id: string;
  screenName: string;
  displayName: string;
  text: string;
  favorites: number;
  retweets: number;
  views: number;
  createdAt: string;
  avatar?: string;
  verified?: boolean;
  url: string;
}

// Watched accounts — key voices on XRP/Ripple/CLARITY
const WATCH_ACCOUNTS = [
  'bgarlinghouse',  // Ripple CEO
  'Ripple',         // Official Ripple
  'ashgoblue',      // Evernorth CEO
  'evernorthxrp',   // Evernorth
  'RepMaxineWaters', // CLARITY Act
  'RepBryanSteil',  // CLARITY Act
];

const PROXY_URL = process.env.CORAL_PROXY_URL || '';
const TOKEN = process.env.CORAL_PROXY_TOKEN || process.env.PROXY_TOKEN || '';

const AUTH_HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
};

async function searchTweets(query: string): Promise<Tweet[]> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `${PROXY_URL}/api/social-proxy/twitter/search.php?query=${encoded}&search_type=Latest`,
      { headers: AUTH_HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return parseTweets(data.timeline || []);
  } catch { return []; }
}

async function getTimeline(screenname: string): Promise<Tweet[]> {
  try {
    const res = await fetch(
      `${PROXY_URL}/api/social-proxy/twitter/timeline.php?screenname=${screenname}`,
      { headers: AUTH_HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return parseTweets(data.timeline || []);
  } catch { return []; }
}

function parseTweets(items: any[]): Tweet[] {
  return items
    .filter(t => t.type === 'tweet' && t.text)
    .map(t => ({
      id: t.tweet_id || t.id_str || String(Math.random()),
      screenName: t.screen_name || '',
      displayName: t.name || t.screen_name || '',
      text: t.text || '',
      favorites: Number(t.favorites) || 0,
      retweets: Number(t.retweets) || 0,
      views: Number(t.views) || 0,
      createdAt: t.created_at || '',
      avatar: t.avatar || t.profile_image_url || '',
      verified: t.verified || false,
      url: `https://x.com/${t.screen_name}/status/${t.tweet_id}`,
    }));
}

function isRecentEnough(createdAt: string, hours = 48): boolean {
  try {
    const ts = new Date(createdAt).getTime();
    return Date.now() - ts < hours * 60 * 60 * 1000;
  } catch { return true; }
}

export async function GET() {
  const today = new Date().toISOString().split('T')[0];

  // Parallel: broad keyword search + watched account timelines
  const [keywordTweets, ...accountTweets] = await Promise.all([
    searchTweets(
      `(XRP OR Ripple OR "CLARITY Act" OR RLUSD OR Evernorth OR XRPN) min_faves:30 since:${today}`
    ),
    ...WATCH_ACCOUNTS.map(a => getTimeline(a)),
  ]);

  // Merge all, deduplicate by id
  const all = [...keywordTweets, ...accountTweets.flat()];
  const seen = new Set<string>();
  const unique = all.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Filter watched account tweets to relevant content only
  const keywords = ['xrp', 'ripple', 'clarity', 'rlusd', 'xrpl', 'evernorth', 'xrpn', 'stablecoin', 'crypto'];
  const filtered = unique.filter(t => {
    const isWatched = WATCH_ACCOUNTS.map(a => a.toLowerCase()).includes(t.screenName.toLowerCase());
    if (isWatched) {
      // Include watched account tweets if recent and keyword-relevant
      const text = t.text.toLowerCase();
      return isRecentEnough(t.createdAt, 72) && keywords.some(k => text.includes(k));
    }
    return true; // keyword search results already filtered
  });

  // Sort by engagement (favorites + retweets*2) desc
  filtered.sort((a, b) => (b.favorites + b.retweets * 2) - (a.favorites + a.retweets * 2));

  return NextResponse.json({ tweets: filtered.slice(0, 20), asOf: Date.now() });
}
