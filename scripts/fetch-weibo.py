#!/usr/bin/env python3
"""Fetch Weibo hot search trending topics."""
import json, re, sys, urllib.request
from datetime import datetime, timezone

output = 'data/weibo-trends.json'
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def fetch_weibo():
    """Scrape Weibo hot search from tophub.today."""
    req = urllib.request.Request(
        'https://tophub.today/n/KqndgxeLl9',
        headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8')
    
    items = re.findall(r'<a[^>]*target="_blank"[^>]*>([^<]+)</a>', html)
    trends = []
    seen = set()
    for item in items:
        item = item.strip()
        if not item or len(item) < 2 or item in seen:
            continue
        if item.startswith('http') or item in ('tophub.today', '今日热榜'):
            continue
        seen.add(item)
        trends.append({'topic': item, 'source': 'weibo'})
    return trends[:20]

trends = []
try:
    trends = fetch_weibo()
    print(f'Weibo: {len(trends)} items')
except Exception as e:
    print(f'Weibo fetch failed: {e}', file=sys.stderr)

with open(output, 'w', encoding='utf-8') as f:
    json.dump({'updated': now, 'trends': trends}, f, ensure_ascii=False, indent=2)
print(f'Wrote {len(trends)} trends to {output}')
