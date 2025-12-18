#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import requests
import json
import time

time.sleep(2)  # Give server time to start

print("Testing POST /settings/reset endpoint...")
try:
    response = requests.post("http://localhost:80/settings/reset", timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {response.headers}")
    print(f"Response Body: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"JSON Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
    else:
        print(f"Error: {response.status_code} - {response.reason}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")
