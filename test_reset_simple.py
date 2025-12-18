#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import requests
import time
import sys

time.sleep(3)

print("=" * 50)
print("Testing POST /settings/reset endpoint...")
print("=" * 50)

try:
    url = "http://localhost:80/settings/reset"
    print(f"POST {url}")
    
    response = requests.post(url, timeout=5)
    
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response Headers:")
    for header, value in response.headers.items():
        print(f"  {header}: {value}")
    print(f"\nResponse Body:")
    print(response.text)
    
    if response.status_code == 200:
        import json
        data = response.json()
        print(f"\nJSON Response:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"\nException: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
