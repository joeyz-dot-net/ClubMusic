#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试歌曲添加逻辑 - 验证新歌曲添加到最上位置
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.playlists import Playlist

def test_add_song_to_top():
    """测试歌曲添加到最上位置"""
    print("\n" + "="*70)
    print("测试: 歌曲添加到歌单最上位置")
    print("="*70)
    
    # 创建测试歌单
    playlist = Playlist(playlist_id="test", name="测试歌单")
    
    # 添加歌曲 1
    song1 = {"url": "song1.mp3", "title": "歌曲 1", "type": "local"}
    playlist.add_song(song1)
    print(f"\n添加歌曲 1 后:")
    for i, song in enumerate(playlist.songs):
        print(f"  [{i}] {song.get('title', song)}")
    
    # 添加歌曲 2
    song2 = {"url": "song2.mp3", "title": "歌曲 2", "type": "local"}
    playlist.add_song(song2)
    print(f"\n添加歌曲 2 后:")
    for i, song in enumerate(playlist.songs):
        print(f"  [{i}] {song.get('title', song)}")
    
    # 添加歌曲 3
    song3 = {"url": "song3.mp3", "title": "歌曲 3", "type": "local"}
    playlist.add_song(song3)
    print(f"\n添加歌曲 3 后:")
    for i, song in enumerate(playlist.songs):
        print(f"  [{i}] {song.get('title', song)}")
    
    # 验证顺序
    print("\n" + "="*70)
    print("✅ 验证结果:")
    print("="*70)
    
    if len(playlist.songs) == 3:
        print(f"✓ 歌曲总数正确: {len(playlist.songs)}")
    else:
        print(f"✗ 歌曲总数错误: {len(playlist.songs)}")
        return False
    
    # 检查顺序 (应该是 3, 2, 1)
    expected_order = ["歌曲 3", "歌曲 2", "歌曲 1"]
    actual_order = [song.get('title', song) for song in playlist.songs]
    
    if actual_order == expected_order:
        print(f"✓ 歌曲顺序正确: {actual_order}")
        print("\n✅ 测试通过: 新歌曲添加到最上位置!")
        return True
    else:
        print(f"✗ 歌曲顺序错误:")
        print(f"  预期: {expected_order}")
        print(f"  实际: {actual_order}")
        return False

def test_add_duplicate_song():
    """测试添加重复歌曲的去重逻辑"""
    print("\n" + "="*70)
    print("测试: 重复歌曲去重")
    print("="*70)
    
    playlist = Playlist(playlist_id="test2", name="测试歌单 2")
    
    song1 = {"url": "song1.mp3", "title": "歌曲 1", "type": "local"}
    song2 = {"url": "song2.mp3", "title": "歌曲 2", "type": "local"}
    song1_dup = {"url": "song1.mp3", "title": "歌曲 1", "type": "local"}
    
    # 添加歌曲
    result1 = playlist.add_song(song1)
    result2 = playlist.add_song(song2)
    result1_dup = playlist.add_song(song1_dup)
    
    print(f"\n添加歌曲 1: {result1}")
    print(f"添加歌曲 2: {result2}")
    print(f"添加重复歌曲 1: {result1_dup}")
    
    print(f"\n最终歌单:")
    for i, song in enumerate(playlist.songs):
        print(f"  [{i}] {song.get('title', song)}")
    
    print("="*70)
    if len(playlist.songs) == 2 and not result1_dup:
        print("✅ 测试通过: 重复歌曲被正确去除!")
        return True
    else:
        print("✗ 测试失败: 重复歌曲逻辑有问题")
        return False

if __name__ == "__main__":
    print("\n" + "🧪 歌曲添加逻辑测试")
    
    test1 = test_add_song_to_top()
    test2 = test_add_duplicate_song()
    
    print("\n" + "="*70)
    print("📊 测试总结:")
    print("="*70)
    print(f"测试 1 (添加到最上位置): {'✅ 通过' if test1 else '❌ 失败'}")
    print(f"测试 2 (重复歌曲去重): {'✅ 通过' if test2 else '❌ 失败'}")
    
    if test1 and test2:
        print("\n✅ 所有测试通过!")
        sys.exit(0)
    else:
        print("\n❌ 有测试失败")
        sys.exit(1)
