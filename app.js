// ═══════════════════════════════════════════════
// NARRATIVE — Early signal dashboard
// ═══════════════════════════════════════════════

const REFRESH_MS = 2 * 60 * 1000; // 2 minutes
const SNAPSHOT_KEY = 'narrative_snapshot';

// CORS proxies
const PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
];

// ── PANELS ──────────────────────────────────────
const PANELS = [
  {
    id: 'rising',
    icon: '⚡',
    title: 'RISING NOW',
    feeds: [
      { name: 'HN Rising', url: 'https://hnrss.org/newest?points=10&count=25' },
      { name: 'Reddit Rising', url: 'https://www.reddit.com/r/all/rising.rss?limit=20' },
      { name: 'Product Hunt', url: 'https://www.producthunt.com/feed' },
    ],
    description: 'climbing right now'
  },
  {
    id: 'github',
    icon: '🔧',
    title: 'GITHUB TRENDING',
    special: 'github',
    description: 'breakout repos under 20k stars'
  },
  {
    id: 'wiki',
    icon: '📈',
    title: 'WIKIPEDIA SPIKES',
    special: 'wikipedia',
    description: 'what the world just searched'
  },
  {
    id: 'ai',
    icon: '🤖',
    title: 'AI & TECH',
    feeds: [
      { name: 'ArXiv AI', url: 'https://rss.arxiv.org/rss/cs.AI' },
      { name: 'ArXiv LG', url: 'https://rss.arxiv.org/rss/cs.LG' },
      { name: 'TechMeme', url: 'https://www.techmeme.com/feed.xml' },
      { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
    ],
    description: 'papers, launches, breakthroughs'
  },
  {
    id: 'xtrends',
    icon: '𝕏',
    title: 'X TRENDING',
    special: 'xtrends',
    description: 'what twitter is talking about right now'
  },
  {
    id: 'polymarket',
    icon: '🎰',
    title: 'POLYMARKET',
    special: 'polymarket',
    description: 'money where mouth is — sorted by 24h volume'
  },
  {
    id: 'culture',
    icon: '🌊',
    title: 'VIRAL',
    feeds: [
      { name: 'Reddit Rising', url: 'https://www.reddit.com/r/all/rising.rss?limit=15' },
      { name: 'r/nextfuckinglevel', url: 'https://www.reddit.com/r/nextfuckinglevel/rising.rss?limit=10' },
      { name: 'r/MadeMeSmile', url: 'https://www.reddit.com/r/MadeMeSmile/rising.rss?limit=10' },
      { name: 'r/PublicFreakout', url: 'https://www.reddit.com/r/PublicFreakout/rising.rss?limit=10' },
      { name: 'r/aww', url: 'https://www.reddit.com/r/aww/rising.rss?limit=10' },
      { name: 'r/OutOfTheLoop', url: 'https://www.reddit.com/r/OutOfTheLoop/hot.rss?limit=8' },
      { name: 'Know Your Meme', url: 'https://knowyourmeme.com/newsfeed.rss' },
    ],
    description: 'normie viral — pup energy'
  },
  {
    id: 'pumpportal',
    icon: '🚀',
    title: 'PUMP.FUN TOP VOL',
    special: 'pumpportal',
    description: 'highest volume tokens on pump.fun right now'
  },
];

// ── DELTA TRACKING ──────────────────────────────

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveSnapshot(panelId, items) {
  const snap = loadSnapshot();
  snap[panelId] = {
    time: Date.now(),
    keys: items.map(i => itemKey(i)),
    // For wikipedia: store view counts for delta calc
    views: items.reduce((acc, i) => {
      if (i.viewCount) acc[itemKey(i)] = i.viewCount;
      return acc;
    }, {}),
    // For github: store star counts
    stars: items.reduce((acc, i) => {
      if (i.starCount) acc[itemKey(i)] = i.starCount;
      return acc;
    }, {}),
  };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
}

function itemKey(item) {
  return item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

function getDelta(panelId, item) {
  const snap = loadSnapshot();
  const prev = snap[panelId];
  if (!prev) return { isNew: true, delta: null };

  const key = itemKey(item);
  const wasPresent = prev.keys.includes(key);

  // Wikipedia view delta
  if (item.viewCount && prev.views?.[key]) {
    const viewDelta = item.viewCount - prev.views[key];
    return { isNew: false, delta: viewDelta, type: 'views' };
  }

  // GitHub star delta
  if (item.starCount && prev.stars?.[key]) {
    const starDelta = item.starCount - prev.stars[key];
    return { isNew: false, delta: starDelta, type: 'stars' };
  }

  return { isNew: !wasPresent, delta: null };
}

// ── SPECIAL FETCHERS ────────────────────────────

async function fetchGitHubTrending() {
  const html = await fetchViaProxy('https://github.com/trending?since=daily&spoken_language_code=en');
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = [];

  doc.querySelectorAll('article.Box-row').forEach(row => {
    const repoLink = row.querySelector('h2 a');
    if (!repoLink) return;
    const repo = repoLink.getAttribute('href')?.replace(/^\//, '') || '';
    const desc = row.querySelector('p')?.textContent?.trim() || '';
    const starsText = row.querySelector('.d-inline-block.float-sm-right')?.textContent?.trim() || '';
    const lang = row.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || '';
    const starCount = parseInt(starsText.replace(/[^0-9]/g, '')) || 0;

    // Get total stars from the stargazers link
    const stargazerLink = row.querySelector('a[href*="/stargazers"]');
    let totalStars = 0;
    if (stargazerLink) {
      totalStars = parseInt(stargazerLink.textContent.replace(/[^0-9]/g, '')) || 0;
    }

    // Filter: only show breakout projects (<20k total stars)
    if (totalStars >= 20000) return;

    items.push({
      title: repo,
      link: `https://github.com/${repo}`,
      source: lang || 'GitHub',
      meta: desc,
      badge: starsText,
      starCount,
      date: new Date(),
    });
  });

  return items.slice(0, 20);
}

async function fetchWikipediaSpikes() {
  const yesterday = new Date(Date.now() - 86400000);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${d}`;
  const resp = await fetch(url);
  const data = await resp.json();

  const items = [];
  const boring = new Set(['Main_Page', 'Special:Search', 'Wikipedia:Featured_pictures', '-', 'Portal:Current_events', 'Special:CreateAccount', 'Special:Watchlist']);

  if (data.items?.[0]?.articles) {
    data.items[0].articles.forEach(a => {
      if (boring.has(a.article)) return;
      if (a.article.startsWith('Special:') || a.article.startsWith('Wikipedia:') || a.article.startsWith('File:') || a.article.startsWith('Portal:')) return;

      const name = a.article.replace(/_/g, ' ');

      items.push({
        title: name,
        link: `https://en.wikipedia.org/wiki/${a.article}`,
        source: `${a.views.toLocaleString()} views`,
        viewCount: a.views,
        date: yesterday,
      });
    });
  }

  return items.slice(0, 25);
}

// X Trends — scraped from getdaytrends.com (real-time, no API key)
async function fetchXTrends() {
  const html = await fetchViaProxy('https://getdaytrends.com/united-states/');
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = [];

  doc.querySelectorAll('a[href*="/trend/"]').forEach(a => {
    const topic = a.textContent?.trim();
    if (!topic) return;
    // Deduplicate
    if (items.find(i => i.title === topic)) return;
    items.push({
      title: topic,
      link: `https://x.com/search?q=${encodeURIComponent(topic)}`,
      source: 'X Trending US',
      date: new Date(),
    });
  });

  return items.slice(0, 25);
}

// Polymarket — top markets by 24h volume (no auth, CORS enabled)
async function fetchPolymarket() {
  const url = 'https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr&ascending=false&limit=20';
  let markets;
  try {
    // Try direct first (might work with CORS)
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    markets = await resp.json();
  } catch(e) {
    // Fall back to proxy
    const proxied = await fetchViaProxy(url);
    markets = JSON.parse(proxied);
  }

  // Filter out sports game lines — keep the signal, not the spreads
  const skipPatterns = /^(Lakers|Celtics|Warriors|Pistons|Pacers|Rockets|Bulls|Spurs|Heat|Magic|Knicks|Nets|Suns|Mavs|Nuggets|Thunder|Clippers|Kings|Grizzlies|Pelicans|Raptors|Hawks|Hornets|Cavaliers|Wizards|Bucks|Timberwolves|Trail Blazers|Jazz|76ers)\s+vs\./i;

  return markets
    .filter(m => !skipPatterns.test(m.question))
    .map(m => {
      const vol = parseFloat(m.volume24hr || 0);
      const volStr = vol >= 1000000 ? `$${(vol/1000000).toFixed(1)}M` : `$${(vol/1000).toFixed(0)}K`;
      return {
        title: m.question,
        link: `https://polymarket.com/event/${m.slug || m.conditionId}`,
        source: volStr + ' vol',
        date: new Date(m.startDate || m.createdAt || Date.now()),
      };
    });
}

// Pump.fun — top volume tokens via REST API
async function fetchPumpTopVolume() {
  const url = 'https://frontend-api-v3.pump.fun/coins/currently-live?limit=25&offset=0&sort=volume&order=DESC&includeNsfw=false';
  let coins;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    coins = await resp.json();
  } catch(e) {
    // Try via proxy
    const proxied = await fetchViaProxy(url);
    coins = JSON.parse(proxied);
  }

  return coins.map(c => {
    const mcap = c.usd_market_cap || 0;
    const mcapStr = mcap >= 1000000 ? `$${(mcap/1000000).toFixed(1)}M` :
                    mcap >= 1000 ? `$${(mcap/1000).toFixed(0)}K` :
                    `$${mcap.toFixed(0)}`;
    return {
      title: `${c.symbol} — ${c.name}`,
      link: `https://pump.fun/coin/${c.mint}`,
      source: `${mcapStr} mcap`,
      date: new Date(c.created_timestamp || Date.now()),
    };
  });
}

// ── CORE RSS FETCHER ────────────────────────────

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0 || seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function extractSource(title) {
  const match = title.match(/\s-\s([^-]+)$/);
  if (match) return { clean: title.replace(/\s-\s[^-]+$/, '').trim(), source: match[1].trim() };
  return { clean: title, source: '' };
}

async function fetchViaProxy(feedUrl) {
  for (const makeUrl of PROXIES) {
    try {
      const url = makeUrl(feedUrl);
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.text();
      try {
        const json = JSON.parse(raw);
        if (json.contents) return json.contents;
      } catch(e) {}
      return raw;
    } catch(e) { continue; }
  }
  throw new Error('All proxies failed');
}

async function fetchFeed(feedUrl, feedName) {
  const text = await fetchViaProxy(feedUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const items = [];

  doc.querySelectorAll('item, entry').forEach(entry => {
    const rawTitle = entry.querySelector('title')?.textContent?.trim() || '';
    const link = entry.querySelector('link')?.textContent?.trim()
      || entry.querySelector('link')?.getAttribute('href') || '';
    const pubDate = entry.querySelector('pubDate, published, updated')?.textContent?.trim();
    if (!rawTitle) return;
    const { clean, source } = extractSource(rawTitle);
    items.push({ title: clean, link, source: source || feedName, date: pubDate ? new Date(pubDate) : new Date() });
  });

  return items;
}

// ── PANEL RENDERING ─────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function deltaTag(panelId, item) {
  const d = getDelta(panelId, item);

  if (d.isNew) return '<span class="delta delta-new">🆕</span>';

  if (d.delta !== null) {
    if (d.type === 'views' && d.delta > 10000) {
      return `<span class="delta delta-hot">🔥 +${(d.delta/1000).toFixed(0)}K</span>`;
    }
    if (d.type === 'views' && d.delta > 1000) {
      return `<span class="delta delta-warm">↑ +${(d.delta/1000).toFixed(0)}K</span>`;
    }
    if (d.type === 'stars' && d.delta > 50) {
      return `<span class="delta delta-hot">🔥 +${d.delta}★</span>`;
    }
    if (d.type === 'stars' && d.delta > 10) {
      return `<span class="delta delta-warm">↑ +${d.delta}★</span>`;
    }
  }

  return '';
}

function renderItems(items, feedEl, countEl, panelId) {
  if (items.length === 0) {
    feedEl.innerHTML = '<div class="panel-error">No items loaded</div>';
    countEl.textContent = '0';
    return;
  }

  countEl.textContent = items.length;
  feedEl.innerHTML = items.map(item => `
    <div class="feed-item${getDelta(panelId, item).isNew ? ' is-new' : ''}">
      <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
      ${item.meta ? `<div class="item-desc">${escapeHtml(item.meta)}</div>` : ''}
      <div class="meta">
        <span class="source">${escapeHtml(item.source)}</span>
        ${item.badge ? `<span class="badge">${escapeHtml(item.badge)}</span>` : ''}
        ${deltaTag(panelId, item)}
        <span class="time">${timeAgo(item.date)}</span>
      </div>
    </div>
  `).join('');

  // Save snapshot AFTER rendering (so deltas compare against previous)
  saveSnapshot(panelId, items);
}

async function loadPanel(panel) {
  const feedEl = document.querySelector(`#panel-${panel.id} .panel-feed`);
  const countEl = document.querySelector(`#panel-${panel.id} .item-count`);

  feedEl.innerHTML = '<div class="panel-loading"><span class="spinner"></span>Loading...</div>';

  try {
    if (panel.special === 'github') {
      const items = await fetchGitHubTrending();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'wikipedia') {
      const items = await fetchWikipediaSpikes();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'xtrends') {
      const items = await fetchXTrends();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'polymarket') {
      const items = await fetchPolymarket();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'pumpportal') {
      const items = await fetchPumpTopVolume();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    const results = await Promise.allSettled(
      panel.feeds.map(f => fetchFeed(f.url, f.name))
    );

    let allItems = [];
    results.forEach(r => {
      if (r.status === 'fulfilled') allItems = allItems.concat(r.value);
    });

    const seen = new Set();
    allItems = allItems.filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    allItems.sort((a, b) => b.date - a.date);
    allItems = allItems.slice(0, 30);

    renderItems(allItems, feedEl, countEl, panel.id);
  } catch(e) {
    feedEl.innerHTML = `<div class="panel-error">Failed to load: ${e.message}</div>`;
  }
}

// ── CLOCK & REFRESH ─────────────────────────────

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toISOString().slice(11, 19) + ' UTC';
}

function updateRefreshTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('last-refresh').textContent = `refreshed ${h}:${m}`;
}

let refreshTimer;
function startCountdown() {
  const el = document.getElementById('countdown');
  let sec = REFRESH_MS / 1000;
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    sec--;
    if (sec <= 0) sec = REFRESH_MS / 1000;
    el.textContent = `next ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  }, 1000);
}

async function refreshAll() {
  updateRefreshTime();
  startCountdown();
  await Promise.allSettled(PANELS.map(p => loadPanel(p)));
}

function buildGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = PANELS.map(p => `
    <div class="panel" id="panel-${p.id}">
      <div class="panel-header">
        <span><span class="category-icon">${p.icon}</span>${p.title}</span>
        <span class="item-count">—</span>
      </div>
      ${p.description ? `<div class="panel-desc">${p.description}</div>` : ''}
      <div class="panel-feed"></div>
    </div>
  `).join('');
}

function init() {
  buildGrid();
  updateClock();
  setInterval(updateClock, 1000);
  refreshAll();
  setInterval(refreshAll, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);
