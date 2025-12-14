#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import requests
import time

# 测试排行榜API
def test_ranking_api():
    base_url = "http://localhost:8000"
    
    print("=" * 60)
    print("测试排行榜 API")
    print("=" * 60)
    
    # 测试 /ranking?period=all
    print("\n1. 测试 /ranking?period=all")
    try:
        response = requests.get(f"{base_url}/ranking?period=all", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ 成功获取排行榜数据")
            print(f"  Status: {data.get('status')}")
            print(f"  Period: {data.get('period')}")
            print(f"  Items: {len(data.get('ranking', []))}")
            
            if data.get('ranking'):
                print(f"\n  前 3 项:")
                for i, item in enumerate(data.get('ranking', [])[:3], 1):
                    print(f"    {i}. {item.get('title', 'Unknown')}")
                    print(f"       播放次数: {item.get('play_count', 0)}")
                    print(f"       类型: {item.get('type', 'unknown')}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"✗ 错误: {e}")
    
    # 测试 /ranking?period=week
    print("\n2. 测试 /ranking?period=week")
    try:
        response = requests.get(f"{base_url}/ranking?period=week", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ 成功获取周排行榜")
            print(f"  Items: {len(data.get('ranking', []))}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 错误: {e}")
    
    # 测试 /ranking?period=month
    print("\n3. 测试 /ranking?period=month")
    try:
        response = requests.get(f"{base_url}/ranking?period=month", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ 成功获取月排行榜")
            print(f"  Items: {len(data.get('ranking', []))}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 错误: {e}")
    
if __name__ == "__main__":
    print("\n⏳ 等待服务器启动...\n")
    time.sleep(2)
    test_ranking_api()
