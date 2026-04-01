'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PredictionMarket } from './api/markets/route';
import type { Tweet } from './api/social/route';
import type { RegulatoryItem, RegulatoryNews } from './api/regulatory/route';

interface XRPData {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: number;
  high24h: number | null;
  low24h: number | null;
  intraday24hPrices: [number, number][];
  intraday24hVolumes: [number, number][];
  priceHistory: [number, number][];
  volumeHistory: [number, number][];
}

interface NewsArticle {
  id: string;
  title: string;
  body: string;
  url: string;
  source: string;
  imageUrl: string;
  publishedAt: number;
}

function fmt(n: number, digits = 2) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(digits);
}

function fmtY(n: number, isVolume = false): string {
  if (isVolume) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
    return '$' + n.toFixed(0);
  }
  return '$' + n.toFixed(4);
}

// Small info tooltip bubble
function InfoTip({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="info-tip-wrap">
      <span
        className="info-tip-icon"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(s => !s)}
      >i</span>
      {show && <span className="info-tip-bubble">{label}</span>}
    </span>
  );
}

function MiniChart({ data, color, isVolume = false }: { data: [number, number][]; color: string; isVolume?: boolean }) {
  if (!data || data.length < 2) return <div className="mini-chart-empty">No data</div>;
  const values = data.map(d => d[1]);
  const xLabels = data.map(d => new Date(d[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = (rawMax - rawMin) * 0.08 || rawMax * 0.05;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;

  const W = 300, H = 90;
  const padL = 52, padR = 8, padT = 8, padB = 22;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const uid = color.replace('#', '');

  // 3 Y ticks
  const yTicks = [0, 0.5, 1].map(t => min + range * t);

  const toX = (i: number) => padL + (i / (values.length - 1)) * cW;
  const toY = (v: number) => padT + (1 - (v - min) / range) * cH;

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const area = `${padL},${padT + cH} ` + pts + ` ${padL + cW},${padT + cH}`;

  // X labels: just first and last
  const xShow = [0, values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '90px' }}>
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y grid lines + labels */}
      {yTicks.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line
              x1={padL} y1={y} x2={padL + cW} y2={y}
              stroke="#1e2d40" strokeWidth="1"
              strokeDasharray={i === 0 ? '0' : '3,3'}
            />
            <text
              x={padL - 4} y={y + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="#4a6070"
              fontFamily="Space Mono, monospace"
            >
              {fmtY(v, isVolume)}
            </text>
          </g>
        );
      })}

      {/* Area + line */}
      <polygon points={area} fill={`url(#grad-${uid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* X axis baseline */}
      <line x1={padL} y1={padT + cH} x2={padL + cW} y2={padT + cH} stroke="#1e2d40" strokeWidth="1" />

      {/* X labels: first and last only */}
      {xShow.map(i => (
        <text
          key={i}
          x={toX(i)}
          y={H - 4}
          textAnchor={i === 0 ? 'start' : 'end'}
          fontSize="9"
          fill="#4a6070"
          fontFamily="Space Grotesk, sans-serif"
        >
          {xLabels[i]}
        </text>
      ))}
    </svg>
  );
}

// Full chart with Y axis, grid lines, X labels
function FullChart({
  data, color, type, yLabel, isVolume = false
}: {
  data: [number, number][];
  color: string;
  type: 'line' | 'bar';
  yLabel: string;
  isVolume?: boolean;
}) {
  if (!data || data.length < 2) return <div className="chart-empty">No data available</div>;

  const values = data.map(d => d[1]);
  const xLabels = data.map(d =>
    new Date(d[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = (rawMax - rawMin) * 0.08 || rawMax * 0.05;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;

  // Chart geometry
  const W = 780, H = 220;
  const padL = 72, padR = 16, padT = 16, padB = 36;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  // Y axis ticks — 4 evenly spaced
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    min + (range * i) / yTicks
  );

  const toX = (i: number) =>
    type === 'line'
      ? padL + (i / (values.length - 1)) * cW
      : padL + (i + 0.5) * (cW / values.length);

  const toY = (v: number) => padT + (1 - (v - min) / range) * cH;

  // Line chart path
  const linePts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPts = `${padL},${padT + cH} ` + linePts + ` ${padL + cW},${padT + cH}`;

  // Bar dims
  const barSlot = cW / values.length;
  const barW = barSlot * 0.65;

  const uid = `chart-${color.replace('#', '')}-${type}`;

  return (
    <div className="full-chart-wrap">
      {/* Y axis label (rotated) */}
      <div className="y-axis-label">{yLabel}</div>
      <div className="chart-inner">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '220px' }}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Dotted grid lines + Y tick labels */}
          {yTickValues.map((v, i) => {
            const y = toY(v);
            return (
              <g key={i}>
                <line
                  x1={padL} y1={y} x2={padL + cW} y2={y}
                  stroke="#1e2d40" strokeWidth="1"
                  strokeDasharray={i === 0 ? '0' : '4,4'}
                />
                <text
                  x={padL - 6} y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#4a6070"
                  fontFamily="Space Mono, monospace"
                >
                  {fmtY(v, isVolume)}
                </text>
              </g>
            );
          })}

          {/* Chart area */}
          {type === 'line' && (
            <>
              <polygon points={areaPts} fill={`url(#${uid})`} />
              <polyline
                points={linePts}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {values.map((v, i) => (
                <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill={color} />
              ))}
            </>
          )}

          {type === 'bar' && values.map((v, i) => {
            const bH = ((v - min) / range) * cH;
            const bX = padL + i * barSlot + (barSlot - barW) / 2;
            const bY = padT + cH - bH;
            return (
              <rect
                key={i}
                x={bX} y={bY}
                width={barW} height={bH}
                fill={color} fillOpacity="0.75" rx="3"
              />
            );
          })}

          {/* X axis line */}
          <line
            x1={padL} y1={padT + cH}
            x2={padL + cW} y2={padT + cH}
            stroke="#1e2d40" strokeWidth="1"
          />

          {/* X tick labels */}
          {xLabels.map((label, i) => (
            <text
              key={i}
              x={toX(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="#4a6070"
              fontFamily="Space Grotesk, sans-serif"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// Regulatory watch card with expand/collapse
function RegCard({ item }: { item: RegulatoryItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`reg-card status-${item.status}${expanded ? ' expanded' : ''}`}>
      <div className="reg-card-header">
        <span className="reg-card-label">{item.label}</span>
        <span className={`reg-status-pill status-${item.status}`}>{item.statusText}</span>
      </div>
      <div className="reg-direction">{item.direction}</div>
      <div className="reg-detail">{item.detail}</div>
      <span className="reg-toggle" onClick={() => setExpanded(e => !e)}>
        {expanded ? '▲ Less' : '▼ Details'}
      </span>
      <div className="reg-updated">Updated {item.lastUpdated}</div>
    </div>
  );
}

const CAT_LABELS: Record<string, string> = {
  sec: 'SEC', cftc: 'CFTC', legislation: 'Legislation',
  international: 'Intl', product: 'Product',
};

export default function XRPDashboard() {
  const [xrp, setXrp] = useState<XRPData | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [regWatchlist, setRegWatchlist] = useState<RegulatoryItem[]>([]);
  const [regNews, setRegNews] = useState<RegulatoryNews[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [xrpRes, newsRes, marketsRes, socialRes, regRes] = await Promise.all([
        fetch('/api/xrp'),
        fetch('/api/news'),
        fetch('/api/markets'),
        fetch('/api/social'),
        fetch('/api/regulatory'),
      ]);
      const xrpData = await xrpRes.json();
      const newsData = await newsRes.json();
      const marketsData = await marketsRes.json();
      const socialData = await socialRes.json();
      const regData = await regRes.json();
      if (xrpData.error) throw new Error(xrpData.error);
      setXrp(xrpData);
      setNews(newsData.articles || []);
      setMarkets(marketsData.markets || []);
      setTweets(socialData.tweets || []);
      setRegWatchlist(regData.watchlist || []);
      setRegNews(regData.news || []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const up = xrp && xrp.change24h >= 0;

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#00AAE4" fillOpacity="0.15" />
            <path d="M16 6 L22 16 L16 26 L10 16 Z" fill="#00AAE4" fillOpacity="0.8" />
            <circle cx="16" cy="16" r="4" fill="#00AAE4" />
          </svg>
          <span className="logo-text">XRP<span>Watch</span></span>
        </div>
        <nav className="nav">
          <a href="#overview" className="nav-item active">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
            Overview
          </a>
          <a href="#chart" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M3.5 18.5l6-6 4 4L22 6.92"/><path d="M22 6.92H16.5m5.5 0v5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
            Price Chart
          </a>
          <a href="#volume" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M4 20V10m4 10V4m4 16V8m4 12V14m4 6v-4"/></svg>
            Volume
          </a>
          <a href="#social" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            X Feed
          </a>
          <a href="#markets" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            Markets
          </a>
          <a href="#regulatory" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/></svg>
            Regulatory
          </a>
          <a href="#news" className="nav-item">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8L2 8v12a2 2 0 002 2zm0 0V8m4-6v6H2"/></svg>
            News
          </a>
        </nav>
        <div className="sidebar-footer">
          <div className="refresh-info">
            {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString()}</span>}
          </div>
          <button className="btn-refresh" onClick={fetchAll}>
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M4 12a8 8 0 018-8V2l4 4-4 4V8a6 6 0 106 6h2a8 8 0 11-8-8"/></svg>
            Refresh
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">XRP Dashboard</h1>
            <p className="page-sub">Real-time Ripple network monitoring</p>
          </div>
          {xrp && (
            <div className="price-badge">
              <span className="price-big">${xrp.price.toFixed(4)}</span>
              <span className={`change-badge ${up ? 'up' : 'down'}`}>
                {up ? '▲' : '▼'} {Math.abs(xrp.change24h).toFixed(2)}%
              </span>
            </div>
          )}
        </header>

        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Fetching XRP data...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <span>⚠️ {error}</span>
            <button onClick={fetchAll}>Retry</button>
          </div>
        )}

        {xrp && !loading && (
          <>
            {/* Stats row */}
            <section id="overview" className="stats-grid">
              <div className="stat-card primary">
                <div className="stat-label">
                  XRP Price — 24h Intraday
                  <InfoTip label="Source: CoinGecko — /coins/ripple/market_chart?days=1 (~5-min resolution). Shows today's price movement. Refreshes every 60s." />
                </div>
                <div className="stat-value">${xrp.price.toFixed(4)}</div>
                <div className={`stat-change ${up ? 'up' : 'down'}`}>
                  {up ? '▲' : '▼'} {Math.abs(xrp.change24h).toFixed(2)}% (24h)
                </div>
                {xrp.high24h !== null && xrp.low24h !== null && (
                  <div className="stat-highlow">
                    <span className="hl-high">H: ${xrp.high24h.toFixed(4)}</span>
                    <span className="hl-low">L: ${xrp.low24h.toFixed(4)}</span>
                  </div>
                )}
                <div className="stat-chart">
                  <MiniChart data={xrp.intraday24hPrices} color={up ? '#22d3a0' : '#f87171'} isVolume={false} />
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  24h Volume — Intraday
                  <InfoTip label="Source: CoinGecko — /coins/ripple/market_chart?days=1 (~5-min resolution). Shows today's volume flow. Refreshes every 60s." />
                </div>
                <div className="stat-value">{fmt(xrp.volume24h)}</div>
                <div className="stat-sub">Rolling 24h total</div>
                <div className="stat-chart">
                  <MiniChart data={xrp.intraday24hVolumes} color="#00AAE4" isVolume={true} />
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  Market Cap
                  <InfoTip label="Source: CoinGecko — /simple/price (usd_market_cap). Refreshes every 60s." />
                </div>
                <div className="stat-value">{fmt(xrp.marketCap)}</div>
                <div className="stat-sub">Circulating supply value</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  XRP per USD
                  <InfoTip label="Derived: 1 ÷ current XRP/USD price (CoinGecko)." />
                </div>
                <div className="stat-value">{(1 / xrp.price).toFixed(2)}</div>
                <div className="stat-sub">Tokens per $1</div>
              </div>
            </section>

            {/* Price chart */}
            <section id="chart" className="chart-section card">
              <div className="section-header">
                <h2>Price History (7 days)</h2>
                <span className="section-badge">USD</span>
                <InfoTip label="Source: CoinGecko — /coins/ripple/market_chart?days=7&interval=daily (1 point/day). Different from the intraday sparkline above. Refreshes every 5 min." />
              </div>
              <FullChart
                data={xrp.priceHistory}
                color={up ? '#22d3a0' : '#f87171'}
                type="line"
                yLabel="Price (USD)"
                isVolume={false}
              />
            </section>

            {/* Volume chart */}
            <section id="volume" className="chart-section card">
              <div className="section-header">
                <h2>Daily Volume (7 days)</h2>
                <span className="section-badge">USD</span>
                <InfoTip label="Source: CoinGecko — /coins/ripple/market_chart?vs_currency=usd&days=7&interval=daily (total_volumes). Refreshes every 5 min." />
              </div>
              <FullChart
                data={xrp.volumeHistory}
                color="#00AAE4"
                type="bar"
                yLabel="Volume (USD)"
                isVolume={true}
              />
            </section>
          </>
        )}

        {/* X / Twitter Feed */}
        <section id="social" className="social-section">
          <div className="section-header">
            <h2>X Feed — XRP, Ripple &amp; CLARITY Act</h2>
            <span className="section-badge">{tweets.length > 0 ? `${tweets.length} posts` : 'loading'}</span>
            <InfoTip label="Source: X (Twitter) — keyword search (XRP, Ripple, CLARITY Act, RLUSD, Evernorth, XRPN, min 30 likes today) + watched accounts: @bgarlinghouse, @Ripple, @ashgoblue, @evernorthxrp. Refreshes every 2 min." />
          </div>
          {tweets.length === 0 ? (
            <div className="empty-state">No posts found for today yet.</div>
          ) : (
            <div className="tweets-grid">
              {tweets.map(t => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className="tweet-card">
                  <div className="tweet-header">
                    <div className="tweet-author">
                      {t.avatar && <img src={t.avatar} alt="" className="tweet-avatar" />}
                      <div>
                        <div className="tweet-name">{t.displayName}</div>
                        <div className="tweet-handle">@{t.screenName}</div>
                      </div>
                    </div>
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" className="tweet-x-icon"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </div>
                  <p className="tweet-text">{t.text}</p>
                  <div className="tweet-stats">
                    <span>❤️ {t.favorites.toLocaleString()}</span>
                    <span>🔁 {t.retweets.toLocaleString()}</span>
                    {t.views > 0 && <span>👁 {Number(t.views).toLocaleString()}</span>}
                    <span className="tweet-time">{new Date(t.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Prediction Markets */}
        <section id="markets" className="markets-section">
          <div className="section-header">
            <h2>Prediction Markets</h2>
            <span className="section-badge">{markets.length > 0 ? `${markets.length} active` : 'monitoring'}</span>
            <InfoTip label="Source: Polymarket Gamma API — scanning active markets for XRP/Ripple regulatory, legal, ETF, and adoption events. Price-level bets filtered out. Refreshes every 2 min." />
          </div>
          {markets.length === 0 ? (
            <div className="markets-empty">
              <div className="markets-empty-icon">📡</div>
              <div className="markets-empty-title">No active markets found</div>
              <div className="markets-empty-sub">
                Monitoring Polymarket for non-price markets on XRP, Ripple, CLARITY Act, RLUSD, Evernorth, and XRPN —
                regulatory outcomes, legal cases, ETF approvals, IPO events, and adoption milestones.
                Price-level and up/down bets are filtered out. This section will populate automatically when relevant markets appear.
              </div>
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="markets-link">
                Browse Polymarket →
              </a>
            </div>
          ) : (
            <div className="markets-grid">
              {markets.map(m => (
                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                   className={`market-card${m.kind === 'price-sentinel' ? ' market-card-sentinel' : ''}`}>
                  {m.kind === 'price-sentinel' && m.sentinelLabel && (
                    <div className="market-sentinel-label">{m.sentinelLabel}</div>
                  )}
                  <div className="market-question">{m.question}</div>
                  <div className="market-bar-wrap">
                    <div className="market-bar">
                      <div className="market-bar-yes" style={{ width: `${m.yesProb * 100}%` }} />
                    </div>
                    <div className="market-probs">
                      <span className="market-yes">{(m.yesProb * 100).toFixed(0)}% Yes</span>
                      <span className="market-no">{(m.noProb * 100).toFixed(0)}% No</span>
                    </div>
                  </div>
                  <div className="market-meta">
                    <span>Vol 24h: {m.volume24h > 0 ? '$' + m.volume24h.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</span>
                    {m.endDate && <span>Closes {new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    <span className="market-source">Polymarket</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Regulatory Watch */}
        <section id="regulatory" className="regulatory-section">
          <div className="card" style={{ padding: '24px' }}>
            <div className="section-header">
              <h2>Regulatory &amp; Legal Watch</h2>
              <span className="section-badge">{regWatchlist.length} items monitored</span>
              <InfoTip label="Status dashboard for key regulatory, legal, and legislative developments affecting XRP and the Ripple ecosystem. Click '▼ Details' on any card for the full context. Updated weekly." />
            </div>

            {/* Legend */}
            <div className="reg-legend" style={{ marginBottom: '16px' }}>
              <div className="reg-legend-item"><div className="reg-legend-dot positive" /> Positive development</div>
              <div className="reg-legend-item"><div className="reg-legend-dot warning"  /> Active risk / pending</div>
              <div className="reg-legend-item"><div className="reg-legend-dot neutral"  /> Neutral / monitoring</div>
              <div className="reg-legend-item"><div className="reg-legend-dot watch"    /> Active watchlist item</div>
            </div>

            {/* Watchlist grid */}
            {regWatchlist.length > 0 ? (
              <div className="regulatory-grid">
                {regWatchlist.map(item => <RegCard key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="empty-state">Loading regulatory data...</div>
            )}
          </div>

          {/* Regulatory news */}
          {regNews.length > 0 && (
            <div className="card" style={{ padding: '24px' }}>
              <div className="section-header">
                <h2>Regulatory News Feed</h2>
                <span className="section-badge">Last 7 days · {regNews.length} stories</span>
                <InfoTip label="Sources: CoinTelegraph (Ripple + Regulation tags) + Decrypt — filtered for XRP, Ripple, GENIUS Act, CLARITY Act, RLUSD, XRPL. Refreshes every 5 min." />
              </div>
              <div className="reg-news-list">
                {regNews.map(article => (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="reg-news-item"
                  >
                    <span className={`reg-news-cat ${article.category}`}>
                      {CAT_LABELS[article.category] || article.category}
                    </span>
                    <div className="reg-news-body">
                      <div className="reg-news-title">{article.title}</div>
                      {article.summary && (
                        <div className="reg-news-summary">{article.summary}</div>
                      )}
                      <div className="reg-news-meta">
                        <span>{article.source}</span>
                        <span>{new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* News */}
        <section id="news" className="news-section">
          <div className="section-header">
            <h2>Latest News — XRP, Ripple &amp; CLARITY Act</h2>
            <span className="section-badge">Last 7 days · {news.length} stories</span>
            <InfoTip label="Sources: CoinTelegraph RSS (XRP, Ripple, Regulation tags) + Decrypt RSS — filtered for XRP, Ripple, CLARITY Act, RLUSD, XRPL. Refreshes every 5 min." />
          </div>
          {news.length === 0 && !loading && (
            <div className="empty-state">No news articles found.</div>
          )}
          <div className="news-grid">
            {news.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="news-card"
              >
                {article.imageUrl && (
                  <img src={article.imageUrl} alt="" className="news-img" />
                )}
                <div className="news-body">
                  <div className="news-meta">
                    <span className="news-source">{article.source}</span>
                    <span className="news-time">
                      {new Date(article.publishedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <h3 className="news-title">{article.title}</h3>
                  <p className="news-excerpt">{article.body}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer / Sources */}
        <footer className="sources-footer">
          <div className="sources-title">Data Sources</div>
          <div className="sources-list">
            <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer" className="source-link">
              <span className="source-num">①</span> CoinGecko Public API
              <span className="source-desc">— Price, volume, market cap, 7-day chart history</span>
            </a>
            <a href="https://cointelegraph.com" target="_blank" rel="noopener noreferrer" className="source-link">
              <span className="source-num">②</span> CoinTelegraph RSS
              <span className="source-desc">— XRP, Ripple &amp; Regulation tags</span>
            </a>
            <a href="https://decrypt.co" target="_blank" rel="noopener noreferrer" className="source-link">
              <span className="source-num">③</span> Decrypt RSS
              <span className="source-desc">— Filtered for XRP, Ripple, CLARITY Act, RLUSD</span>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="source-link">
              <span className="source-num">④</span> X (Twitter)
              <span className="source-desc">— Keyword search + @bgarlinghouse, @Ripple, @ashgoblue, @evernorthxrp</span>
            </a>
            <span className="source-link" style={{ cursor: 'default' }}>
              <span className="source-num">⑤</span> Regulatory Watch
              <span className="source-desc">— Curated status tracking: SEC case, RLUSD, CFTC, ETFs, MiCA, GENIUS Act, XRPL DeFi</span>
            </span>
          </div>
          <div className="sources-note">
            All data is provided for informational purposes only. Not financial advice. Prices refresh every 60s, charts every 5 min. Regulatory status updated manually on material developments.
          </div>
        </footer>
      </main>
    </div>
  );
}
