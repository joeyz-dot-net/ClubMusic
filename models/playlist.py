"""
播放列表基类和子类实现
"""

import json
import os
from abc import ABC, abstractmethod
from .song import Song, LocalSong, StreamSong


class BasePlaylist(ABC):
    """播放列表基类 - 抽象基类"""

    def __init__(self, max_size: int = None):
        """初始化播放列表

        参数:
          max_size: 列表最大大小（None表示无限制）
        """
        self._items = []  # 存储项目的列表
        self._current_index = -1
        self._max_size = max_size

    def add(self, item):
        """添加项目到列表末尾"""
        self._items.append(item)
        if self._max_size and len(self._items) > self._max_size:
            self._items = self._items[-self._max_size :]

    def insert(self, index: int, item):
        """在指定位置插入项目"""
        self._items.insert(index, item)
        if self._max_size and len(self._items) > self._max_size:
            self._items = self._items[-self._max_size :]

    def remove(self, index: int):
        """删除指定位置的项目"""
        if 0 <= index < len(self._items):
            self._items.pop(index)
            # 调整当前索引
            if self._current_index >= index and self._current_index > 0:
                self._current_index -= 1

    def clear(self):
        """清空列表"""
        self._items = []
        self._current_index = -1

    def get_current(self):
        """获取当前项目"""
        if 0 <= self._current_index < len(self._items):
            return self._items[self._current_index]
        return None

    def set_current_index(self, index: int):
        """设置当前索引"""
        if -1 <= index < len(self._items):
            self._current_index = index

    def get_current_index(self) -> int:
        """获取当前索引"""
        return self._current_index

    def get_item(self, index: int):
        """获取指定位置的项目"""
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    def get_all(self) -> list:
        """获取所有项目"""
        return self._items.copy()

    def size(self) -> int:
        """获取列表大小"""
        return len(self._items)

    def is_empty(self) -> bool:
        """列表是否为空"""
        return len(self._items) == 0

    def next(self):
        """移动到下一个项目"""
        if self._current_index < len(self._items) - 1:
            self._current_index += 1
            return self.get_current()
        return None

    def previous(self):
        """移动到上一个项目"""
        if self._current_index > 0:
            self._current_index -= 1
            return self.get_current()
        return None

    def has_next(self) -> bool:
        """是否有下一个项目"""
        return self._current_index < len(self._items) - 1

    def has_previous(self) -> bool:
        """是否有上一个项目"""
        return self._current_index > 0

    @abstractmethod
    def to_dict(self) -> dict:
        """转换为字典"""
        pass

    @abstractmethod
    def from_dict(self, data: dict):
        """从字典加载"""
        pass

    def __repr__(self):
        return f"{self.__class__.__name__}(size={len(self._items)}, current_index={self._current_index})"


class PlayQueue(BasePlaylist):
    """播放队列 - 当前播放的歌曲队列"""

    def __init__(self):
        """初始化播放队列"""
        super().__init__(max_size=None)  # 播放队列无大小限制

    def reorder(self, from_index: int, to_index: int):
        """重新排序：将from_index的歌曲移动到to_index"""
        if 0 <= from_index < len(self._items) and 0 <= to_index < len(self._items):
            song = self._items.pop(from_index)
            self._items.insert(to_index, song)
            # 调整当前索引
            if self._current_index == from_index:
                self._current_index = to_index
            elif from_index < self._current_index <= to_index:
                self._current_index -= 1
            elif to_index <= self._current_index < from_index:
                self._current_index += 1

    def sort_queue(self, sort_by: str = "add_order", reverse: bool = False):
        """对播放队列中的项目进行排序（改变队列顺序）

        参数:
          sort_by: 排序方式
                  - 'add_order': 按添加顺序（默认）
                  - 'current_first': 当前播放的歌曲优先（置顶）
                  - 'type': 按歌曲类型排序（本地在前，串流在后）
          reverse: 是否反向排序
        """
        if self.is_empty():
            return

        try:
            if sort_by == "add_order":
                # 按添加顺序排序（已是添加顺序，仅反向）
                if reverse:
                    self._items.reverse()

            elif sort_by == "current_first":
                # 当前播放的歌曲优先（置顶）
                if 0 <= self._current_index < len(self._items):
                    current_song = self._items.pop(self._current_index)
                    self._items.insert(0, current_song)
                    self._current_index = 0
                    if reverse:
                        self._items.reverse()

            elif sort_by == "type":
                # 按歌曲类型排序（本地在前，串流在后）
                local_songs = [
                    song for song in self._items if isinstance(song, LocalSong)
                ]
                stream_songs = [
                    song for song in self._items if isinstance(song, StreamSong)
                ]

                if reverse:
                    self._items = stream_songs + local_songs
                else:
                    self._items = local_songs + stream_songs

                # 更新当前索引
                if 0 <= self._current_index < len(self._items):
                    current_song = self._items[self._current_index]
                    # 重新查找当前歌曲的新位置
                    for idx, song in enumerate(self._items):
                        if song is current_song:
                            self._current_index = idx
                            break

            print(f"[INFO] 播放队列已重排序（sort_by={sort_by}, reverse={reverse}）")
        except Exception as e:
            print(f"[ERROR] 播放队列排序失败: {e}")
            import traceback

            traceback.print_exc()

    def play(
        self,
        index: int = None,
        save_to_history: bool = True,
        mpv_command_func=None,
        mpv_pipe_exists_func=None,
        ensure_mpv_func=None,
        add_to_history_func=None,
        music_dir: str = None,
    ) -> bool:
        """播放队列中的歌曲

        参数:
          index: 要播放的歌曲索引（如果为None，播放当前索引的歌曲）
          save_to_history: 是否保存到播放历史
          mpv_command_func: mpv命令函数
          mpv_pipe_exists_func: 检查mpv管道是否存在的函数
          ensure_mpv_func: 确保mpv运行的函数
          add_to_history_func: 添加到历史记录的函数
          music_dir: 音乐库目录（用于解析本地文件相对路径）

        返回:
          bool: 播放是否成功
        """
        if index is not None:
            if 0 <= index < len(self._items):
                self._current_index = index
            else:
                print(f"[ERROR] PlayQueue.play: 索引 {index} 超出范围")
                return False

        song = self.get_current()
        if song is None:
            print(f"[ERROR] PlayQueue.play: 没有当前歌曲")
            return False

        print(
            f"[DEBUG] PlayQueue.play -> 索引={self._current_index}, 歌曲类型={type(song).__name__}"
        )

        # 根据歌曲类型调用相应的播放方法
        if isinstance(song, LocalSong):
            print(f"[DEBUG] 调用本地歌曲播放方法")
            return song.play(
                mpv_command_func=mpv_command_func,
                mpv_pipe_exists_func=mpv_pipe_exists_func,
                ensure_mpv_func=ensure_mpv_func,
                add_to_history_func=add_to_history_func,
                save_to_history=save_to_history,
                music_dir=music_dir,
            )
        elif isinstance(song, StreamSong):
            print(f"[DEBUG] 调用串流歌曲播放方法")
            return song.play(
                mpv_command_func=mpv_command_func,
                mpv_pipe_exists_func=mpv_pipe_exists_func,
                ensure_mpv_func=ensure_mpv_func,
                add_to_history_func=add_to_history_func,
                save_to_history=save_to_history,
                music_dir=music_dir,
            )
        else:
            print(f"[ERROR] PlayQueue.play: 未知的歌曲类型 {type(song)}")
            return False

    def play_at_index(
        self,
        index: int,
        save_to_history: bool = True,
        mpv_command_func=None,
        mpv_pipe_exists_func=None,
        ensure_mpv_func=None,
        add_to_history_func=None,
        music_dir: str = None,
    ) -> bool:
        """在指定索引播放歌曲（设置当前索引并播放）

        参数:
          index: 要播放的歌曲索引
          save_to_history: 是否保存到播放历史
          mpv_command_func: mpv命令函数
          mpv_pipe_exists_func: 检查mpv管道是否存在的函数
          ensure_mpv_func: 确保mpv运行的函数
          add_to_history_func: 添加到历史记录的函数
          music_dir: 音乐库目录（用于解析本地文件相对路径）

        返回:
          bool: 播放是否成功
        """
        if index < 0 or index >= len(self._items):
            print(f"[ERROR] PlayQueue.play_at_index: 索引 {index} 超出范围")
            return False

        return self.play(
            index=index,
            save_to_history=save_to_history,
            mpv_command_func=mpv_command_func,
            mpv_pipe_exists_func=mpv_pipe_exists_func,
            ensure_mpv_func=ensure_mpv_func,
            add_to_history_func=add_to_history_func,
            music_dir=music_dir,
        )

    def play_next(
        self,
        save_to_history: bool = True,
        mpv_command_func=None,
        mpv_pipe_exists_func=None,
        ensure_mpv_func=None,
        add_to_history_func=None,
        music_dir: str = None,
    ) -> bool:
        """播放下一首歌曲

        参数:
          save_to_history: 是否保存到播放历史
          mpv_command_func: mpv命令函数
          mpv_pipe_exists_func: 检查mpv管道是否存在的函数
          ensure_mpv_func: 确保mpv运行的函数
          add_to_history_func: 添加到历史记录的函数
          music_dir: 音乐库目录（用于解析本地文件相对路径）

        返回:
          bool: 播放是否成功
        """
        if not self.has_next():
            print("[INFO] 已到达播放队列末尾")
            return False

        next_song = self.next()
        if next_song is None:
            return False

        print(f"[INFO] 已自动播放队列中的下一首: {next_song.title}")
        return self.play(
            save_to_history=save_to_history,
            mpv_command_func=mpv_command_func,
            mpv_pipe_exists_func=mpv_pipe_exists_func,
            ensure_mpv_func=ensure_mpv_func,
            add_to_history_func=add_to_history_func,
            music_dir=music_dir,
        )

    def to_dict(self) -> dict:
        """转换为字典（包含队列状态）"""
        return {
            "songs": [song.to_dict() for song in self._items],
            "current_index": self._current_index,
        }

    def from_dict(self, data: dict):
        """从字典加载（包含队列状态）"""
        if isinstance(data, dict):
            songs_data = data.get("songs", [])
            self._items = [Song.from_dict(song_data) for song_data in songs_data]
            self._current_index = data.get("current_index", -1)
            # 确保索引在有效范围内
            if self._current_index >= len(self._items):
                self._current_index = -1

    def clear_queue(self):
        """清空播放队列（不停止播放当前歌曲）"""
        self._items = []
        # 保留当前正在播放的歌曲的元数据信息，但重置索引
        self._current_index = -1


class PlayHistory(BasePlaylist):
    """播放历史 - 历史播放记录"""

    def __init__(self, max_size: int = 50, file_path: str = None):
        """初始化播放历史

        参数:
          max_size: 历史记录最大条数（默认 50）
          file_path: 持久化存储文件路径
        """
        super().__init__(max_size=max_size)
        self._file_path = file_path

    def add_to_history(self, url_or_path: str, name: str, is_local: bool = False, thumbnail_url: str = None):
        """添加项目到历史记录

        参数:
          url_or_path: URL 或本地文件路径
          name: 项目名称
          is_local: 是否为本地文件
          thumbnail_url: 缩略图URL（可选）
        """
        import time

        # 查找已存在的同一URL记录
        existing_item = None
        for item in self._items:
            if item.get("url") == url_or_path:
                existing_item = item
                break

        if existing_item:
            # 如果已存在，增加play_count并更新时间戳
            existing_item["play_count"] = existing_item.get("play_count", 1) + 1
            existing_item["ts"] = int(time.time())
            existing_item["name"] = name  # 更新名称
            if thumbnail_url:
                existing_item["thumbnail_url"] = thumbnail_url
            # 将该项移动到列表头部
            self._items.remove(existing_item)
            self._items.insert(0, existing_item)
            print(f"[DEBUG] 已更新播放历史: {name} ({existing_item['type']})，播放次数: {existing_item['play_count']}")
        else:
            # 如果不存在，创建新记录
            history_item = {
                "url": url_or_path,
                "name": name,
                "type": "local" if is_local else "youtube",
                "ts": int(time.time()),
                "play_count": 1,
            }
            if thumbnail_url:
                history_item["thumbnail_url"] = thumbnail_url
            self._items.insert(0, history_item)
            # 保持列表大小限制
            if self._max_size and len(self._items) > self._max_size:
                self._items = self._items[: self._max_size]
            print(f"[DEBUG] 已添加播放历史: {name} ({history_item['type']})")

        # 保存到文件
        if self._file_path:
            self.save()

    def set_file_path(self, file_path: str):
        """设置持久化文件路径"""
        self._file_path = file_path

    def save(self):
        """保存历史记录到文件"""
        if not self._file_path:
            return
        try:
            with open(self._file_path, "w", encoding="utf-8") as f:
                json.dump(self._items, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ERROR] 保存播放历史失败: {e}")

    def load(self):
        """从文件加载历史记录"""
        if not self._file_path or not os.path.exists(self._file_path):
            self._items = []
            return

        try:
            with open(self._file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    self._items = data[: self._max_size]
                    print(f"[INFO] 已加载 {len(self._items)} 条播放历史")
                else:
                    self._items = []
        except Exception as e:
            print(f"[ERROR] 加载播放历史失败: {e}")
            self._items = []

    def update_item(self, index: int, **kwargs):
        """更新历史记录中的项目属性

        参数:
          index: 项目索引
          **kwargs: 要更新的属性（如 name, title 等）
        """
        if 0 <= index < len(self._items):
            self._items[index].update(kwargs)
            if self._file_path:
                self.save()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "items": self._items.copy(),
            "current_index": self._current_index,
            "max_size": self._max_size,
        }

    def from_dict(self, data: dict):
        """从字典加载"""
        if isinstance(data, dict):
            self._items = data.get("items", [])[: self._max_size]
            self._current_index = data.get("current_index", -1)
            if self._current_index >= len(self._items):
                self._current_index = -1
