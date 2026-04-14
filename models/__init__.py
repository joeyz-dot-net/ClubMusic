# -*- coding: utf-8 -*-
import importlib
import sys

# 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

_LAZY_EXPORTS = {
    "logger": (".logger", "logger"),
    "setup_logging": (".logger", "setup_logging"),
    "get_logger": (".logger", "get_logger"),
    "Song": (".song", "Song"),
    "LocalSong": (".song", "LocalSong"),
    "StreamSong": (".song", "StreamSong"),
    "BasePlaylist": (".playlist", "BasePlaylist"),
    "PlayHistory": (".playlist", "PlayHistory"),
    "CurrentPlaylist": (".playlist", "CurrentPlaylist"),
    "LocalPlaylist": (".local_playlist", "LocalPlaylist"),
    "Playlist": (".playlists", "Playlist"),
    "Playlists": (".playlists", "Playlists"),
    "MusicPlayer": (".player", "MusicPlayer"),
}


def __getattr__(name):
    try:
        module_name, attr_name = _LAZY_EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc

    module = importlib.import_module(module_name, __name__)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | set(__all__))

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
    "logger",
    "setup_logging",
    "get_logger",
]

