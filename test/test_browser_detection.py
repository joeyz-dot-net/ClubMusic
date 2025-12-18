#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试浏览器检测和心跳配置
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import detect_browser
from models.stream import (
    get_queue_size_for_browser,
    get_heartbeat_config_for_browser,
    QUEUE_SIZE_CONFIG,
    HEARTBEAT_CONFIG
)


def test_browser_detection():
    """测试浏览器检测"""
    print("=" * 60)
    print("浏览器检测测试")
    print("=" * 60)
    
    test_cases = [
        # (User-Agent, expected_browser)
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "chrome"),
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36", "safari"),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0", "edge"),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0", "firefox"),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0", "opera"),
        ("UnknownBrowser/1.0", "unknown"),
    ]
    
    all_passed = True
    for ua, expected in test_cases:
        result = detect_browser(ua)
        status = "✓" if result == expected else "✗"
        if result != expected:
            all_passed = False
        print(f"{status} {ua[:60]}...")
        print(f"  预期: {expected}, 实际: {result}")
        print()
    
    return all_passed


def test_browser_config():
    """测试浏览器配置"""
    print("=" * 60)
    print("浏览器配置测试")
    print("=" * 60)
    
    # 测试 QUEUE_SIZE_CONFIG
    print("\n队列大小配置:")
    for browser, size in QUEUE_SIZE_CONFIG.items():
        print(f"  {browser:10} -> {size:3} blocks × 256KB = {size * 256 / 1024:.0f} MB")
    
    # 测试 HEARTBEAT_CONFIG
    print("\n心跳配置:")
    for browser, config in HEARTBEAT_CONFIG.items():
        print(f"  {browser:10} -> interval: {config['interval']:4.2f}s, timeout: {config['timeout']:2}s")
    
    # 验证每个浏览器都能查询到配置
    print("\n配置查询测试:")
    browsers_to_test = ["safari", "chrome", "firefox", "edge", "unknown"]
    all_passed = True
    for browser in browsers_to_test:
        queue_size = get_queue_size_for_browser(browser)
        hb_config = get_heartbeat_config_for_browser(browser)
        status = "✓" if queue_size and hb_config else "✗"
        if not (queue_size and hb_config):
            all_passed = False
        print(f"{status} {browser:10} -> queue_size={queue_size}, interval={hb_config['interval']:.2f}s")
    
    return all_passed


def test_safari_optimization():
    """测试 Safari 优化是否有效"""
    print("=" * 60)
    print("Safari 优化验证")
    print("=" * 60)
    
    safari_queue = get_queue_size_for_browser("safari")
    safari_config = get_heartbeat_config_for_browser("safari")
    
    other_queue = get_queue_size_for_browser("chrome")
    other_config = get_heartbeat_config_for_browser("chrome")
    
    print(f"Safari 队列大小: {safari_queue} (= {safari_queue * 256 / 1024:.0f} MB)")
    print(f"Chrome 队列大小: {other_queue} (= {other_queue * 256 / 1024:.0f} MB)")
    print(f"Safari 心跳间隔: {safari_config['interval']:.2f}s")
    print(f"Chrome 心跳间隔: {other_config['interval']:.2f}s")
    
    # 验证 Safari 优化是否大于其他浏览器
    passed = (
        safari_queue > other_queue and
        safari_config['interval'] < other_config['interval']
    )
    
    status = "✓" if passed else "✗"
    print(f"\n{status} Safari 优化配置验证 {'通过' if passed else '失败'}")
    return passed


if __name__ == "__main__":
    try:
        test1 = test_browser_detection()
        print("\n")
        test2 = test_browser_config()
        print("\n")
        test3 = test_safari_optimization()
        
        print("\n" + "=" * 60)
        if test1 and test2 and test3:
            print("✓ 所有测试通过！")
            sys.exit(0)
        else:
            print("✗ 部分测试失败")
            sys.exit(1)
    except Exception as e:
        print(f"✗ 测试出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
