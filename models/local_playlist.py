"""
本地浏览歌单模块 - 独立 LocalPlaylist 类
"""

import os
from .song import Song
from .playlist import Playlist

class LocalPlaylist(Playlist):
    """本地浏览歌单，继承 Playlist，歌曲使用 Song 对象。

    约束：仅接受本地歌曲（`type` 为 'local'），但为了兼容，
    如果传入普通 `Song`，会自动标记为本地类型。
    """

    def add_path(self, rel_path: str):
        """通过相对路径添加歌曲，自动构造 Song。

        参数:
          rel_path: 相对于 `music_dir` 的路径（与 `MusicPlayer.build_playlist` 一致）
        """
        name = os.path.basename(rel_path)
        song = Song(url=rel_path, title=name)
        song.type = 'local'
        self.add(song)
        return song

    def add_song(self, song: Song):
        """添加已构造的 `Song` 到本地歌单。"""
        if isinstance(song, Song):
            if getattr(song, 'type', None) != 'local':
                song.type = 'local'
            self.add(song)
            return True
        return False

