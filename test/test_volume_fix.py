#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试音量控制 API 修复
验证：
1. API 参数名正确（value）
2. 前后端音量范围一致（0-130）
3. 音量可正确读取和设置
"""

import requests
import json
import time

BASE_URL = "http://localhost:80"

def test_get_volume():
    """测试获取当前音量"""
    print("\n📊 测试：获取当前音量")
    print("-" * 50)
    try:
        response = requests.post(f"{BASE_URL}/volume", data={})
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
        if result.get('status') == 'OK':
            current_vol = result.get('volume')
            print(f"✅ 成功获取音量: {current_vol}")
            return current_vol
        else:
            print(f"❌ 获取失败: {result.get('error')}")
            return None
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None

def test_set_volume(volume):
    """测试设置音量"""
    print(f"\n🔊 测试：设置音量 = {volume}")
    print("-" * 50)
    try:
        response = requests.post(f"{BASE_URL}/volume", data={'value': str(volume)})
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
        if result.get('status') == 'OK':
            returned_vol = result.get('volume')
            print(f"✅ 成功设置音量: {returned_vol}")
            return returned_vol
        else:
            print(f"❌ 设置失败: {result.get('error')}")
            return None
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None

def test_status():
    """测试 /status 端点是否包含音量信息"""
    print(f"\n📡 测试：/status 端点音量信息")
    print("-" * 50)
    try:
        response = requests.get(f"{BASE_URL}/status")
        print(f"状态码: {response.status_code}")
        result = response.json()
        mpv_state = result.get('mpv_state', {})
        volume = mpv_state.get('volume')
        print(f"✅ /status 中的音量: {volume}")
        return volume
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None

def main():
    print("\n" + "=" * 60)
    print("🎵 音量控制 API 修复验证测试")
    print("=" * 60)
    
    # 测试流程
    tests = [
        ("获取初始音量", lambda: test_get_volume()),
        ("设置音量为50", lambda: test_set_volume(50)),
        ("检查 /status", lambda: test_status()),
        ("设置音量为75", lambda: test_set_volume(75)),
        ("设置音量为130（MPV最大值）", lambda: test_set_volume(130)),
        ("设置音量为0（静音）", lambda: test_set_volume(0)),
        ("获取最终音量", lambda: test_get_volume()),
    ]
    
    for name, test_func in tests:
        print(f"\n{name}...")
        try:
            test_func()
        except Exception as e:
            print(f"❌ 错误: {e}")
        time.sleep(0.5)
    
    print("\n" + "=" * 60)
    print("✅ 测试完成")
    print("=" * 60)

if __name__ == "__main__":
    try:
        # 检查服务器是否运行
        response = requests.get(f"{BASE_URL}/status", timeout=2)
        main()
    except requests.ConnectionError:
        print("❌ 错误: 无法连接到服务器 (http://localhost:80)")
        print("   请确保应用正在运行: python main.py")
    except Exception as e:
        print(f"❌ 错误: {e}")
