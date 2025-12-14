# -*- coding: utf-8 -*-
"""
多歌单管理模块 - 管理多个播放列表（Playlists）
每个 Playlist 包含多首歌曲的路径
"""

import json
import time
import os
from datetime import datetime
from typing import List, Dict, Optional

from models.song import StreamSong

DEFAULT_PLAYLIST_ID = "default"


class Playlist:
    """单个播放列表"""

    def __init__(
        self,
        playlist_id: str = None,
        name: str = "未命名歌单",
        songs: List[str] = None,
        created_at: float = None,
        updated_at: float = None,
    ):
        """初始化播放列表

        参数:
            playlist_id: 歌单唯一标识（自动生成）
            name: 歌单名称
            songs: 歌曲路径列表
            created_at: 创建时间戳
            updated_at: 更新时间戳
        """
        self.id = playlist_id or str(int(time.time() * 1000))
        self.name = name
        self.songs = songs or []
        self.created_at = created_at or time.time()
        self.updated_at = updated_at or time.time()

        # 确保串流歌曲具备缩略图（兼容旧数据）
        self._hydrate_stream_thumbnails()

    def _hydrate_stream_thumbnails(self):
        """补全串流歌曲的缩略图，避免旧数据缺失 thumbnail_url"""
        changed = False
        for song_item in self.songs:
            if not isinstance(song_item, dict):
                continue
            s_type = song_item.get("type")
            if s_type in ("youtube", "stream") and not song_item.get("thumbnail_url"):
                url = song_item.get("url", "")
                title = song_item.get("title")
                duration = song_item.get("duration", 0)
                try:
                    stream_song = StreamSong(
                        stream_url=url,
                        title=title,
                        stream_type=s_type,
                        duration=duration,
                    )
                    thumb = stream_song.get_thumbnail_url()
                    if thumb:
                        song_item["thumbnail_url"] = thumb
                        changed = True
                except Exception:
                    continue
        if changed:
            self.updated_at = time.time()
        return changed

    def add_song(self, song_path_or_dict) -> bool:
        """添加歌曲到歌单

        参数:
            song_path_or_dict: 歌曲文件路径(str)或完整song字典(dict)

        返回:
            True 如果添加成功，False 如果歌曲已存在
        """
        # 支持dict和str两种格式
        if isinstance(song_path_or_dict, dict):
            song_item = song_path_or_dict
            # 补充串流歌曲缩略图
            if (
                isinstance(song_item, dict)
                and song_item.get("type") in ("youtube", "stream")
                and not song_item.get("thumbnail_url")
            ):
                try:
                    stream_song = StreamSong(
                        stream_url=song_item.get("url", ""),
                        title=song_item.get("title"),
                        stream_type=song_item.get("type"),
                        duration=song_item.get("duration", 0),
                    )
                    thumb = stream_song.get_thumbnail_url()
                    if thumb:
                        song_item["thumbnail_url"] = thumb
                except Exception:
                    pass
            # 用URL作为唯一键进行去重检查
            url = song_item.get("url")
            if not any(isinstance(s, dict) and s.get("url") == url for s in self.songs):
                self.songs.append(song_item)
                self.updated_at = time.time()
                return True
        else:
            # 字符串路径方式（向后兼容）
            if song_path_or_dict not in self.songs:
                self.songs.append(song_path_or_dict)
                self.updated_at = time.time()
                return True
        return False

    def remove(self, index: int) -> bool:
        """按索引删除歌曲（兼容旧接口）"""
        if 0 <= index < len(self.songs):
            self.songs.pop(index)
            self.updated_at = time.time()
            return True
        return False

    def reorder(self, from_index: int, to_index: int) -> bool:
        """调整歌曲顺序（兼容旧接口）"""
        if (
            from_index is None
            or to_index is None
            or not (0 <= from_index < len(self.songs))
            or not (0 <= to_index < len(self.songs))
        ):
            return False
        song = self.songs.pop(from_index)
        self.songs.insert(to_index, song)
        self.updated_at = time.time()
        return True

    def remove_song(self, song_path: str) -> bool:
        """从歌单移除歌曲

        参数:
            song_path: 歌曲文件路径

        返回:
            True 如果移除成功，False 如果歌曲不存在
        """
        if song_path in self.songs:
            self.songs.remove(song_path)
            self.updated_at = time.time()
            return True
        return False

    def remove_song_at_index(self, index: int) -> Optional[str]:
        """按索引移除歌曲

        参数:
            index: 歌曲在列表中的索引

        返回:
            被移除的歌曲路径，如果索引无效则返回 None
        """
        if 0 <= index < len(self.songs):
            song_path = self.songs.pop(index)
            self.updated_at = time.time()
            return song_path
        return None

    def get_song(self, index: int) -> Optional[str]:
        """获取指定索引的歌曲

        参数:
            index: 歌曲索引

        返回:
            歌曲路径，如果索引无效则返回 None
        """
        if 0 <= index < len(self.songs):
            return self.songs[index]
        return None

    def reorder_songs(self, new_order: List[str]) -> bool:
        """重新排序歌曲列表

        参数:
            new_order: 新的歌曲路径列表

        返回:
            True 如果排序成功，False 如果新列表有效性检查失败
        """
        if set(new_order) == set(self.songs):
            self.songs = new_order
            self.updated_at = time.time()
            return True
        return False

    def clear(self):
        """清空歌单中的所有歌曲"""
        self.songs = []
        self.updated_at = time.time()

    def get_all(self) -> List:
        """获取歌单中的所有歌曲 (兼容 CurrentPlaylist API)"""
        return self.songs

    def add(self, song) -> bool:
        """添加歌曲 (兼容 CurrentPlaylist API)"""
        return self.add_song(song)

    def get_song_count(self) -> int:
        """获取歌单中的歌曲数量"""
        return len(self.songs)

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "songs": self.songs,
            "song_count": len(self.songs),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "Playlist":
        """从字典构造 Playlist 对象

        参数:
            data: 包含歌单数据的字典

        返回:
            Playlist 实例
        """
        return cls(
            playlist_id=data.get("id"),
            name=data.get("name", "未命名歌单"),
            songs=data.get("songs", []),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )


class Playlists:
    """多歌单管理器 - 管理多个 Playlist 对象"""

    def __init__(self, data_file: str = "playlists.json"):
        """初始化多歌单管理器

        参数:
            data_file: 保存歌单数据的文件路径
        """
        self.data_file = data_file
        self._playlists: Dict[str, Playlist] = {}  # 按 ID 索引
        self._order: List[str] = []  # 歌单的显示顺序
        self.load()

    def load(self):
        """从文件加载歌单数据"""
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._order = data.get("order", [])
                        playlists_data = data.get("playlists", [])
                    else:
                        # 兼容旧格式（直接是列表）
                        self._order = []
                        playlists_data = data if isinstance(data, list) else []

                    hydration_changed = False
                    for pl_data in playlists_data:
                        pl = Playlist.from_dict(pl_data)
                        # 再次补全缩略图（兼容旧数据），如有变更稍后保存
                        if pl._hydrate_stream_thumbnails():
                            hydration_changed = True
                        self._playlists[pl.id] = pl
                        if pl.id not in self._order:
                            self._order.append(pl.id)

                    if hydration_changed:
                        self.save()

                    print(f"[DEBUG] 已加载 {len(self._playlists)} 个歌单")
            except Exception as e:
                print(f"[ERROR] 加载歌单失败: {e}")
                self._playlists = {}
                self._order = []
        else:
            print(f"[DEBUG] 歌单文件不存在，创建新的歌单集合")
            self._playlists = {}
            self._order = []

        # 确保存在默认歌单
        if DEFAULT_PLAYLIST_ID not in self._playlists:
            default_pl = Playlist(playlist_id=DEFAULT_PLAYLIST_ID, name="默认歌单")
            self._playlists[DEFAULT_PLAYLIST_ID] = default_pl
            if DEFAULT_PLAYLIST_ID not in self._order:
                self._order.insert(0, DEFAULT_PLAYLIST_ID)
            self.save()

    def save(self):
        """保存歌单数据到文件"""
        try:
            data = {
                "order": self._order,
                "playlists": [pl.to_dict() for pl in self.get_all()],
            }
            with open(self.data_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[DEBUG] 已保存 {len(self._playlists)} 个歌单")
        except Exception as e:
            print(f"[ERROR] 保存歌单失败: {e}")

    def create_playlist(self, name: str) -> Playlist:
        """创建新歌单

        参数:
            name: 歌单名称

        返回:
            新创建的 Playlist 对象
        """
        playlist = Playlist(name=name)
        self._playlists[playlist.id] = playlist
        self._order.append(playlist.id)
        self.save()
        print(f"[DEBUG] 创建新歌单: {name} (ID: {playlist.id})")
        return playlist

    def get_playlist(self, playlist_id: str) -> Optional[Playlist]:
        """获取指定 ID 的歌单

        参数:
            playlist_id: 歌单 ID

        返回:
            Playlist 对象，如果不存在则返回 None
        """
        return self._playlists.get(playlist_id)

    def delete_playlist(self, playlist_id: str) -> bool:
        """删除歌单

        参数:
            playlist_id: 歌单 ID

        返回:
            True 如果删除成功，False 如果歌单不存在
        """
        if playlist_id in self._playlists:
            del self._playlists[playlist_id]
            if playlist_id in self._order:
                self._order.remove(playlist_id)
            self.save()
            print(f"[DEBUG] 删除歌单: {playlist_id}")
            return True
        return False

    def rename_playlist(self, playlist_id: str, new_name: str) -> bool:
        """重命名歌单

        参数:
            playlist_id: 歌单 ID
            new_name: 新的歌单名称

        返回:
            True 如果重命名成功，False 如果歌单不存在
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            playlist.name = new_name
            playlist.updated_at = time.time()
            self.save()
            print(f"[DEBUG] 重命名歌单: {playlist_id} -> {new_name}")
            return True
        return False

    def get_all(self) -> List[Playlist]:
        """获取所有歌单（按显示顺序）

        返回:
            Playlist 对象列表
        """
        return [self._playlists[pid] for pid in self._order if pid in self._playlists]

    def get_all_dicts(self) -> List[Dict]:
        """获取所有歌单的字典表示

        返回:
            歌单字典列表
        """
        return [pl.to_dict() for pl in self.get_all()]

    def get_count(self) -> int:
        """获取歌单总数"""
        return len(self._playlists)

    def reorder_playlists(self, new_order: List[str]) -> bool:
        """重新排序歌单

        参数:
            new_order: 新的歌单 ID 列表

        返回:
            True 如果排序成功，False 如果新列表有效性检查失败
        """
        if set(new_order) == set(self._order):
            self._order = new_order
            self.save()
            return True
        return False

    def add_song_to_playlist(self, playlist_id: str, song_path: str) -> bool:
        """添加歌曲到指定歌单

        参数:
            playlist_id: 歌单 ID
            song_path: 歌曲文件路径

        返回:
            True 如果添加成功，False 如果歌单不存在或歌曲已存在
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            result = playlist.add_song(song_path)
            if result:
                self.save()
            return result
        return False

    def remove_song_from_playlist(self, playlist_id: str, song_path: str) -> bool:
        """从歌单移除歌曲

        参数:
            playlist_id: 歌单 ID
            song_path: 歌曲文件路径

        返回:
            True 如果移除成功，False 如果歌单不存在或歌曲不存在
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            result = playlist.remove_song(song_path)
            if result:
                self.save()
            return result
        return False

    def remove_song_at_index(self, playlist_id: str, index: int) -> Optional[str]:
        """从歌单按索引移除歌曲

        参数:
            playlist_id: 歌单 ID
            index: 歌曲索引

        返回:
            被移除的歌曲路径，如果歌单不存在或索引无效则返回 None
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            song_path = playlist.remove_song_at_index(index)
            if song_path:
                self.save()
            return song_path
        return None

    def get_playlist_songs(self, playlist_id: str) -> List[str]:
        """获取歌单中的所有歌曲路径

        参数:
            playlist_id: 歌单 ID

        返回:
            歌曲路径列表
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            return playlist.songs
        return []

    def reorder_playlist_songs(self, playlist_id: str, new_order: List[str]) -> bool:
        """重新排序歌单中的歌曲

        参数:
            playlist_id: 歌单 ID
            new_order: 新的歌曲路径列表

        返回:
            True 如果排序成功，False 如果歌单不存在或新列表无效
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            result = playlist.reorder_songs(new_order)
            if result:
                self.save()
            return result
        return False

    def clear_playlist(self, playlist_id: str) -> bool:
        """清空歌单

        参数:
            playlist_id: 歌单 ID

        返回:
            True 如果清空成功，False 如果歌单不存在
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            playlist.clear()
            self.save()
            return True
        return False

    def export_playlist(self, playlist_id: str, export_file: str) -> bool:
        """导出歌单到文件

        参数:
            playlist_id: 歌单 ID
            export_file: 导出文件路径

        返回:
            True 如果导出成功
        """
        playlist = self._playlists.get(playlist_id)
        if playlist:
            try:
                with open(export_file, "w", encoding="utf-8") as f:
                    json.dump(playlist.to_dict(), f, ensure_ascii=False, indent=2)
                print(f"[DEBUG] 已导出歌单到: {export_file}")
                return True
            except Exception as e:
                print(f"[ERROR] 导出歌单失败: {e}")
        return False

    def import_playlist(self, import_file: str) -> Optional[Playlist]:
        """导入歌单从文件

        参数:
            import_file: 导入文件路径

        返回:
            导入的 Playlist 对象，如果导入失败则返回 None
        """
        try:
            with open(import_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            playlist = Playlist.from_dict(data)
            self._playlists[playlist.id] = playlist
            self._order.append(playlist.id)
            self.save()
            print(f"[DEBUG] 已导入歌单: {playlist.name}")
            return playlist
        except Exception as e:
            print(f"[ERROR] 导入歌单失败: {e}")
            return None

    def search_playlists(self, keyword: str) -> List[Playlist]:
        """按关键词搜索歌单

        参数:
            keyword: 搜索关键词（匹配歌单名称）

        返回:
            匹配的 Playlist 对象列表
        """
        keyword = keyword.lower()
        return [pl for pl in self.get_all() if keyword in pl.name.lower()]

    def __repr__(self) -> str:
        return f"<Playlists: {self.get_count()} playlists>"
