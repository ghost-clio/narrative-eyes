#!/usr/bin/env python3
"""Fetch Bilibili trending search topics via public API."""
import json, sys, urllib.request
from datetime import datetime, timezone

output = 'data/bilibili-trends.json'
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def fetch_bilibili():
    """Bilibili search trending — public API, no auth."""
    req = urllib.request.Request(
        'https://api.bilibili.com/x/web-interface/search/square?limit=20',
        headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    
    if data.get('code') != 0:
        raise Exception(f"API error: {data.get('message')}")
    
    trends = []
    for item in data.get('data', {}).get('trending', {}).get('list', []):
        keyword = item.get('keyword', '').strip()
        if keyword:
            trends.append({
                'topic': keyword,
                'source': 'bilibili',
                'heat': item.get('hot_id', 0)
            })
    return trends

trends = []
try:
    trends = fetch_bilibili()
    print(f'Bilibili: {len(trends)} items')
except Exception as e:
    print(f'Bilibili fetch failed: {e}', file=sys.stderr)

with open(output, 'w', encoding='utf-8') as f:
    json.dump({'updated': now, 'trends': trends}, f, ensure_ascii=False, indent=2)
print(f'Wrote {len(trends)} trends to {output}')
