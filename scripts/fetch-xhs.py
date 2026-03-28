#!/usr/bin/env python3
"""Fetch XiaoHongShu (Little Red Book) trending from tophub.today."""
import json, re, sys, urllib.request
from datetime import datetime, timezone

output = 'data/xhs-trends.json'
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def fetch_xhs():
    """Scrape XHS trending from tophub.today."""
    req = urllib.request.Request(
        'https://tophub.today/n/LdGvol71Em',
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
        trends.append({'topic': item, 'source': 'xiaohongshu'})
    return trends[:20]

trends = []
try:
    trends = fetch_xhs()
    print(f'XHS: {len(trends)} items')
except Exception as e:
    print(f'XHS fetch failed: {e}', file=sys.stderr)

with open(output, 'w', encoding='utf-8') as f:
    json.dump({'updated': now, 'trends': trends}, f, ensure_ascii=False, indent=2)
print(f'Wrote {len(trends)} trends to {output}')
