#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test that YouTube search results include thumbnail_url"""

import sys
sys.path.insert(0, '.')

from models.song import StreamSong

# Test YouTube search
print("Testing StreamSong.search()...")
result = StreamSong.search("hello", max_results=3)

if result.get("status") == "OK":
    results = result.get("results", [])
    if results:
        first_result = results[0]
        print(f"\n✓ Search successful, found {len(results)} results")
        print(f"\nFirst result structure:")
        for key, value in first_result.items():
            print(f"  {key}: {value}")
        
        # Check for required fields
        required_fields = ["url", "title", "type", "thumbnail_url", "id"]
        missing = [f for f in required_fields if f not in first_result]
        
        if missing:
            print(f"\n✗ Missing fields: {missing}")
            sys.exit(1)
        else:
            print(f"\n✓ All required fields present!")
            print(f"✓ thumbnail_url: {first_result['thumbnail_url']}")
            print(f"✓ type: {first_result['type']}")
    else:
        print("✗ No search results returned")
        sys.exit(1)
else:
    print(f"✗ Search failed: {result}")
    sys.exit(1)
