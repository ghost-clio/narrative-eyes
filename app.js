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
  // ── PAGE 1 (above fold) ──
  {
    id: 'xtrends',
    icon: '𝕏',
    title: 'X TRENDING',
    special: 'xtrends',
    description: 'what twitter is talking about right now'
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
    id: 'wiki',
    icon: '📈',
    title: 'WIKIPEDIA SPIKES',
    special: 'wikipedia',
    description: 'what the world just searched'
  },
  {
    id: 'github',
    icon: '🔧',
    title: 'GITHUB TRENDING',
    special: 'github',
    description: 'breakout repos under 5k stars'
  },
  // ── PAGE 2 (scroll down) ──
  {
    id: 'culture',
    icon: '🌊',
    title: 'VIRAL',
    special: 'viral',
    description: 'fastest rising posts by velocity — engagement per minute'
  },
  {
    id: 'polymarket',
    icon: '🎰',
    title: 'POLYMARKET',
    special: 'polymarket',
    description: 'money where mouth is — sorted by 24h volume'
  },
  {
    id: 'pumpportal',
    icon: '🚀',
    title: 'PUMP.FUN TOP VOL',
    special: 'pumpportal',
    description: 'highest volume tokens on pump.fun right now'
  },
  {
    id: 'weibo',
    icon: '📰',
    title: 'WEIBO HOT',
    special: 'weibo',
    description: 'china social trending — what 600M users are talking about'
  },
  {
    id: 'bilibili',
    icon: '📺',
    title: 'BILIBILI TRENDING',
    special: 'bilibili',
    description: 'china youtube — what gen-z is watching'
  },
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
    if (totalStars >= 5000) return;

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
async function fetchJsonTrends(jsonPath, icon = '📰') {
  try {
    const resp = await fetch(jsonPath + '?t=' + Date.now());
    const data = await resp.json();
    return (data.trends || []).map(t => ({
      title: `${icon} ${t.topic || t.topic_cn || ''}`,
      source: t.source || t.context || '',
      date: new Date(data.updated),
      link: '',
    }));
  } catch(e) {
    console.error(`Failed to fetch ${jsonPath}:`, e);
    return [];
  }
}

async function fetchPumpTopVolume() {
  // Fetch more to have enough after filtering
  const url = 'https://frontend-api-v3.pump.fun/coins/currently-live?limit=50&offset=0&sort=volume&order=DESC&includeNsfw=false';
  let coins;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    coins = await resp.json();
  } catch(e) {
    const proxied = await fetchViaProxy(url);
    coins = JSON.parse(proxied);
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // Filter to tokens created in last 24h only
  coins = coins.filter(c => c.created_timestamp && (now - c.created_timestamp) < DAY);

  return coins.slice(0, 25).map((c, i) => {
    const mcap = c.usd_market_cap || 0;
    const mcapStr = mcap >= 1000000 ? `$${(mcap/1000000).toFixed(1)}M` :
                    mcap >= 1000 ? `$${(mcap/1000).toFixed(0)}K` :
                    `$${mcap.toFixed(0)}`;
    const ageH = (now - c.created_timestamp) / 3600000;
    const ageStr = ageH < 1 ? `${Math.floor(ageH * 60)}m old` : `${ageH.toFixed(1)}h old`;
    return {
      title: `${c.symbol} — ${c.name}`,
      link: `https://pump.fun/coin/${c.mint}`,
      source: `#${i+1} · ${mcapStr} mcap · ${ageStr}`,
      date: new Date(),
    };
  });
}

// Viral — Reddit rising sorted by engagement velocity (score+comments per minute)
async function fetchViral() {
  const subs = ['all', 'nextfuckinglevel', 'PublicFreakout', 'MadeMeSmile', 'interestingasfuck', 'OutOfTheLoop'];
  const results = await Promise.allSettled(
    subs.map(async sub => {
      const url = `https://www.reddit.com/r/${sub}/rising.json?limit=15`;
      const proxied = await fetchViaProxy(url);
      const data = JSON.parse(proxied);
      return data.data?.children?.map(c => c.data) || [];
    })
  );

  let posts = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') posts = posts.concat(r.value);
  });

  const now = Date.now() / 1000;

  // Calculate velocity: (score + comments*2) / age_in_minutes
  // Comments weighted 2x because they indicate deeper engagement
  posts = posts.map(p => {
    const ageMin = Math.max(1, (now - p.created_utc) / 60);
    const engagement = (p.score || 0) + (p.num_comments || 0) * 2;
    const velocity = engagement / ageMin;
    return { ...p, velocity, ageMin };
  });

  // Sort by velocity descending
  posts.sort((a, b) => b.velocity - a.velocity);

  // Dedupe by title
  const seen = new Set();
  posts = posts.filter(p => {
    const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return posts.slice(0, 25).map(p => {
    const velStr = p.velocity >= 100 ? `🔥 ${p.velocity.toFixed(0)}/min` :
                   p.velocity >= 10 ? `⚡ ${p.velocity.toFixed(1)}/min` :
                   `${p.velocity.toFixed(1)}/min`;
    const ageStr = p.ageMin < 60 ? `${Math.floor(p.ageMin)}m old` :
                   `${(p.ageMin/60).toFixed(1)}h old`;
    return {
      title: p.title,
      link: `https://reddit.com${p.permalink}`,
      source: `r/${p.subreddit}`,
      badge: velStr,
      meta: `${p.score}↑ · ${p.num_comments} comments · ${ageStr}`,
      date: new Date(p.created_utc * 1000),
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

    if (panel.special === 'viral') {
      const items = await fetchViral();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'pumpportal') {
      const items = await fetchPumpTopVolume();
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'weibo') {
      const items = await fetchJsonTrends('data/weibo-trends.json', '📰');
      renderItems(items, feedEl, countEl, panel.id);
      return;
    }

    if (panel.special === 'bilibili') {
      const items = await fetchJsonTrends('data/bilibili-trends.json', '📺');
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
