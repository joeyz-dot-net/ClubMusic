"""
音乐播放器数据模型模块
"""

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
    "CurrentPlaylist",
    "LocalPlaylist",
    "Playlist",
    "Playlists",
    "MusicPlayer",
    "Rank",
    "HitRank",
]

