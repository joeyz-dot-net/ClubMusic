"""
音乐播放器数据模型模块
"""

from .song import Song, LocalSong, StreamSong
from .playlist import BasePlaylist, PlayHistory, PlayQueue
from .player import MusicPlayer

__all__ = ['Song', 'LocalSong', 'StreamSong', 'BasePlaylist', 'PlayHistory', 'PlayQueue', 'MusicPlayer']
