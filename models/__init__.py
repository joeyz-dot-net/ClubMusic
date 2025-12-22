# -*- coding: utf-8 -*-
import sys
import os

# 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

"""
音乐播放器数据模型模块
"""
print("\n" + "="*50)
print("初始化 播放器模块...")
print("="*50 + "\n")
print("[Models] 加载 Logger 模块...", end=" ", flush=True)
from .logger import logger, setup_logging, get_logger
print("✓")

print("[Models] 正在加载数据模型模块...")

print("[Models] 加载 Song 模块...", end=" ", flush=True)
from .song import Song, LocalSong, StreamSong
print("✓")

print("[Models] 加载 Playlist 模块...", end=" ", flush=True)
from .playlist import BasePlaylist, PlayHistory, CurrentPlaylist
print("✓")

print("[Models] 加载 LocalPlaylist 模块...", end=" ", flush=True)
from .local_playlist import LocalPlaylist
print("✓")

print("[Models] 加载 Playlists 模块...", end=" ", flush=True)
from .playlists import Playlist, Playlists
print("✓")

print("[Models] 加载 Player 模块...", end=" ", flush=True)
from .player import MusicPlayer
print("✓")

print("[Models] 加载 Rank 模块...", end=" ", flush=True)
from .rank import Rank, HitRank
print("✓")

print("[Models] 所有数据模型已加载完毕！")

__all__ = [
    "Song",
    "LocalSong",
    "StreamSong",
    "BasePlaylist",
    "PlayHistory",
    "LocalPlaylist",
    "Playlist",
    "Playlists",
    "MusicPlayer",
    "Rank",
    "HitRank",
    "logger",
    "setup_logging",
    "get_logger",
]

