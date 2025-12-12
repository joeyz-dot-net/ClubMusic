#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
直接测试 YouTube 播放功能
"""
import os
import sys
import time

# 添加项目目录到路径
app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

from models.player import MusicPlayer

print("=" * 70)
print("YouTube 播放测试")
print("=" * 70)

# 创建播放器实例
player = MusicPlayer()

# 测试 URL
test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
print(f"\n测试 URL: {test_url}")
print(f"当前时间: {time.strftime('%H:%M:%S')}")

# 定义模拟函数
def mock_mpv_command(cmd):
    print(f"  [mpv] 命令: {cmd}")
    return True

def mock_mpv_get(prop):
    print(f"  [mpv] 获取属性: {prop}")
    return "加载中..."

def mock_mpv_pipe_exists():
    return player.mpv_pipe_exists()

def mock_ensure_mpv():
    return player.ensure_mpv()

# 尝试播放
print(f"\n调用 player.play_url()...")
try:
    result = player.play_url(
        url=test_url,
        mpv_command_func=mock_mpv_command,
        mpv_get_func=mock_mpv_get,
        mpv_pipe_exists_func=mock_mpv_pipe_exists,
        ensure_mpv_func=mock_ensure_mpv,
        save_to_history=False,
        update_queue=False
    )
    print(f"\n✓ play_url() 返回: {result}")
    print(f"\n播放元数据:")
    print(f"  name: {player.current_meta.get('name')}")
    print(f"  media_title: {player.current_meta.get('media_title')}")
    print(f"  raw_url: {player.current_meta.get('raw_url')}")
except Exception as e:
    print(f"\n✗ 异常: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("测试完成")
print("=" * 70)
