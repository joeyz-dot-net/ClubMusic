#!/usr/bin/env python3
"""Test settings API endpoints"""

import requests
import json
import time

BASE_URL = "http://localhost"
ENDPOINTS = [
    ("/settings", "GET", None, "获取设置"),
    ("/settings/schema", "GET", None, "获取设置 schema"),
]

print("=" * 60)
print("设置 API 端点测试")
print("=" * 60)

# 测试 GET 端点
for path, method, body, desc in ENDPOINTS:
    try:
        if method == "GET":
            resp = requests.get(f"{BASE_URL}{path}", timeout=5)
        else:
            resp = requests.post(f"{BASE_URL}{path}", json=body, timeout=5)
        
        print(f"\n✓ {method} {path} ({desc})")
        print(f"  状态码: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'data' in data:
                print(f"  数据项数: {len(data['data'])}")
                print(f"  键: {list(data['data'].keys())}")
            elif 'schema' in data:
                print(f"  schema 项数: {len(data['schema'])}")
                print(f"  键: {list(data['schema'].keys())}")
            print("  ✓ 通过")
        else:
            print(f"  ✗ 错误: {resp.text}")
    except Exception as e:
        print(f"\n✗ {method} {path} ({desc})")
        print(f"  错误: {e}")

# 测试设置更新
print("\n" + "-" * 60)
print("测试设置更新")
print("-" * 60)

try:
    resp = requests.post(
        f"{BASE_URL}/settings",
        json={"theme": "light", "language": "en", "stream_volume": 75},
        timeout=5
    )
    print(f"✓ POST /settings (设置更新)")
    print(f"  状态码: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  主题: {data['data']['theme']}")
        print(f"  语言: {data['data']['language']}")
        print(f"  推流音量: {data['data']['stream_volume']}")
        print("  ✓ 通过")
    else:
        print(f"  ✗ 错误: {resp.text}")
except Exception as e:
    print(f"✗ 设置更新失败: {e}")

# 测试设置重置 (最关键的测试)
print("\n" + "-" * 60)
print("测试设置重置 (关键测试)")
print("-" * 60)

try:
    resp = requests.post(f"{BASE_URL}/settings/reset", timeout=5)
    print(f"✓ POST /settings/reset (重置设置)")
    print(f"  状态码: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  状态: {data['status']}")
        print(f"  消息: {data['message']}")
        print(f"  数据项: {list(data['data'].keys())}")
        print(f"  值: {data['data']}")
        print("  ✓ 通过 (设置重置成功！)")
    else:
        print(f"  ✗ 错误 ({resp.status_code}): {resp.text}")
except Exception as e:
    print(f"✗ 设置重置失败: {e}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
