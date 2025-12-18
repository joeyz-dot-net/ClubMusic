#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify the reset settings endpoint works
"""
import json
import requests
import time

print("=" * 60)
print("Testing Settings Reset Functionality")
print("=" * 60)

time.sleep(1)

# Get current settings
print("\n1. Getting current settings...")
response = requests.get("http://localhost:80/settings")
current = response.json()
print(f"   Current settings: {json.dumps(current, indent=4, ensure_ascii=False)}")

# Change a setting (e.g., stream_volume to 25)
print("\n2. Changing stream_volume to 25...")
response = requests.post("http://localhost:80/settings", json={
    "theme": "dark",
    "auto_stream": True,
    "stream_volume": 25,
    "language": "zh"
})
changed = response.json()
print(f"   Changed settings: {json.dumps(changed, indent=4, ensure_ascii=False)}")

# Verify the change
print("\n3. Verifying the change...")
response = requests.get("http://localhost:80/settings")
verify = response.json()
print(f"   Current settings: {json.dumps(verify, indent=4, ensure_ascii=False)}")

# Reset settings
print("\n4. Resetting settings...")
response = requests.post("http://localhost:80/settings/reset")
reset_result = response.json()
print(f"   Response status: {reset_result['status']}")
print(f"   Reset settings: {json.dumps(reset_result, indent=4, ensure_ascii=False)}")

# Verify reset
print("\n5. Verifying reset...")
response = requests.get("http://localhost:80/settings")
final = response.json()
print(f"   Final settings: {json.dumps(final, indent=4, ensure_ascii=False)}")

print("\n" + "=" * 60)
if final['data']['stream_volume'] == 50:
    print("✓ SUCCESS: Settings have been reset to defaults!")
else:
    print("✗ FAILED: Settings were not reset correctly")
print("=" * 60)
