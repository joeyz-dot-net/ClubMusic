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
音乐播放器主类
"""

import json
import threading
import time
import configparser
import subprocess
import re
import logging
from models import Song, LocalSong, StreamSong, Playlist, PlayHistory

logger = logging.getLogger(__name__)

try:
    import opencc as _opencc
    _t2s_converter = _opencc.OpenCC('t2s')

    def _to_simplified(text: str) -> str:
        return _t2s_converter.convert(text)
except ImportError:
    def _to_simplified(text: str) -> str:
        return text


class MusicPlayer:
    """音乐播放器类 - 包含所有播放器配置和状态"""

    # 默认配置常量
    DEFAULT_CONFIG = {
        "MUSIC_DIR": "Z:",
        "ALLOWED_EXTENSIONS": ".mp3,.wav,.flac",
        "SERVER_HOST": "0.0.0.0",
        "SERVER_PORT": "80",
        "DEBUG": "false",
        "MPV_CMD": r'bin\mpv.exe --input-ipc-server=\\.\\pipe\\mpv-pipe --idle=yes --force-window=no --no-video',
        "LOCAL_SEARCH_MAX_RESULTS": "20",
        "YOUTUBE_SEARCH_MAX_RESULTS": "20",
        "YOUTUBE_URL_EXTRA_MAX": "50",
        "LOCAL_VOLUME": "50",
        "PLAYBACK_HISTORY_MAX": "9999",
    }

    @staticmethod
    def _get_app_dir():
        """获取应用程序目录（主程序目录）
        
        支持两种情况：
        1. 开发环境：从 models/player.py 推导到主程序目录
        2. PyInstaller 打包后的 exe：使用 exe 文件所在目录作为主程序目录
        """
        if getattr(sys, 'frozen', False):
            # 打包后的 exe：使用 exe 文件所在目录
            return os.path.dirname(sys.executable)
        else:
            # 开发环境：从 models/player.py 推导到主程序目录
            return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    @staticmethod
    def _normalize_mpv_cmd(mpv_cmd: str, app_dir: str = None) -> str:
        """规范化 MPV 命令中的相对路径为绝对路径
        
        参数:
          mpv_cmd: 原始MPV命令
          app_dir: 应用程序目录（为None时自动获取）
        
        返回:
          规范化后的MPV命令
        """
        if not mpv_cmd:
            return mpv_cmd
        
        if app_dir is None:
            app_dir = MusicPlayer._get_app_dir()
        
        # 简单的路径提取：只处理第一个词（MPV可执行文件路径）
        parts = mpv_cmd.split(None, 1)  # 按第一个空白符分割成两部分
        if not parts:
            return mpv_cmd
        
        exe_path = parts[0].strip('"\'')
        
        # 如果是相对路径，转换为绝对路径
        if not os.path.isabs(exe_path):
            abs_exe_path = os.path.join(app_dir, exe_path)
            if os.path.exists(abs_exe_path):
                # 如果路径包含空格，需要加引号
                if ' ' in abs_exe_path:
                    normalized_exe = f'"{abs_exe_path}"'
                else:
                    normalized_exe = abs_exe_path
                
                # 重新组合命令
                if len(parts) > 1:
                    return normalized_exe + ' ' + parts[1]
                else:
                    return normalized_exe
        
        return mpv_cmd

    @staticmethod
    def _get_default_mpv_cmd():
        """获取默认的 MPV 命令"""
        app_dir = MusicPlayer._get_app_dir()
        
        # 主程序目录下的 bin 子目录中的 mpv.exe 路径
        mpv_path = os.path.join(app_dir, "bin", "mpv.exe")
        return (
            f'"{mpv_path}" '
            "--input-ipc-server=\\\\.\\\pipe\\\\mpv-pipe "
            "--idle=yes --force-window=no --no-video"
        )

    @staticmethod
    def _get_default_ini_path():
        """获取默认配置文件路径"""
        return os.path.join(MusicPlayer._get_app_dir(), "settings.ini")

    @staticmethod
    def _get_yt_dlp_path() -> str:
        """获取 yt-dlp 可执行文件路径（优先使用 bin 目录，其次系统 PATH）"""
        app_dir = MusicPlayer._get_app_dir()
        bin_yt_dlp = os.path.join(app_dir, "bin", "yt-dlp.exe")
        if os.path.exists(bin_yt_dlp):
            return bin_yt_dlp
        return "yt-dlp"

    @staticmethod
    def _is_invalid_title(title, raw_url):
        """判断 mpv 返回的 media-title 是否为无效标题（URL、video ID 等）"""
        try:
            if not title or not isinstance(title, str):
                return True
            s = title.strip()
            if not s or s.startswith("http"):
                return True
            if raw_url and s == raw_url:
                return True
            if "youtu" in s.lower():
                return True
            # YouTube video ID（11字符，仅字母数字和 -_）不作为有效标题
            if len(s) == 11 and all(c.isalnum() or c in ("-", "_") for c in s):
                return True
            return False
        except Exception:
            return True

    @staticmethod
    def ensure_ini_exists(ini_path: str = None):
        """确保INI配置文件存在，不存在则创建默认配置

        参数:
          ini_path: 配置文件路径，为None时使用默认路径
        """
        if ini_path is None:
            ini_path = MusicPlayer._get_default_ini_path()

        logger.debug(f"配置文件路径: {ini_path}")
        if os.path.exists(ini_path):
            logger.debug(f"配置文件已存在，跳过创建")
            return

        logger.info(f"配置文件不存在，创建默认配置...")
        # 使用默认配置（包括默认的 MPV 命令）
        default_cfg = MusicPlayer.DEFAULT_CONFIG.copy()

        logger.debug(f"默认配置内容:")
        for key, value in default_cfg.items():
            if key == "MPV_CMD":
                logger.debug(f" {key}: {value}")
            else:
                logger.debug(f" {key}: {value}")
        parser = configparser.ConfigParser()
        parser["app"] = default_cfg
        with open(ini_path, "w", encoding="utf-8") as w:
            parser.write(w)
        logger.info(f"已生成默认配置文件: {ini_path}")

    def __init__(
        self,
        music_dir="Z:",
        allowed_extensions=".mp3,.wav,.flac",
        server_host="0.0.0.0",
        server_port=80,
        debug=False,
        mpv_cmd=None,
        data_dir=".",
        local_search_max_results=20,
        youtube_search_max_results=20,
        youtube_url_extra_max=50,
        playback_history_max=9999,
    ):
        """
        初始化音乐播放器

        参数:
          music_dir: 音乐库目录路径
          allowed_extensions: 允许的文件扩展名（逗号分隔）
          server_host: FastAPI 服务器主机
          server_port: FastAPI 服务器端口
          debug: 是否启用调试模式
          mpv_cmd: mpv 命令行
          data_dir: 数据文件存储目录
          local_search_max_results: 本地搜索最大结果数
          youtube_search_max_results: YouTube搜索最大结果数
          youtube_url_extra_max: YouTube URL提取最大结果数
        """
        # 配置属性
        self.music_dir = self._normalize_music_dir(music_dir)
        self.allowed_extensions = self._parse_extensions(allowed_extensions)
        self.server_host = server_host
        self.server_port = int(server_port)
        self.debug = debug
        self.local_search_max_results = int(local_search_max_results)
        self.youtube_search_max_results = int(youtube_search_max_results)
        self.youtube_url_extra_max = int(youtube_url_extra_max)
        # 使用类方法避免实例绑定问题
        self.mpv_cmd = mpv_cmd or MusicPlayer._get_default_mpv_cmd()
        # 规范化 MPV 命令中的相对路径
        self.mpv_cmd = MusicPlayer._normalize_mpv_cmd(self.mpv_cmd)
        self.data_dir = data_dir

        # 确保数据目录存在
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir, exist_ok=True)

        # 播放器状态
        self.playlist = []  # 存储相对路径
        self.current_index = -1
        self.current_meta = {}
        self.loop_mode = 0  # 0=不循环, 1=单曲循环, 2=全部循环
        self.pitch_shift = 0  # 音调偏移（-6 到 +6 个半音），0=原调
        self._last_play_time = 0
        self._prev_index = None
        self._prev_meta = None

        # 自动播放线程
        self._auto_thread = None
        self._stop_flag = False
        self._req_id = 0

        # 播放管道名称（用于与mpv通信）
        self.pipe_name = None
        
        # MPV 进程对象
        self.mpv_process = None

        # 播放历史 - 使用 PlayHistory 类
        self.playback_history_file = os.path.join(self.data_dir, "playback_history.json")
        # 支持通过参数或配置文件设置最大保留条数
        try:
            self.playback_history_max = int(playback_history_max)
        except Exception:
            self.playback_history_max = 9999

        self.playback_history = PlayHistory(
            max_size=self.playback_history_max, file_path=self.playback_history_file
        )

        # 播放队列
        from models import CurrentPlaylist
        self.current_playlist = CurrentPlaylist()
        self.current_playlist_file = os.path.join(self.data_dir, "playlist.json")

        # 线程锁
        self._lock = threading.RLock()

        # 加载持久化数据
        self.load_playback_history()
        logger.debug(f'调用 load_current_playlist 前，current_playlist 类型: {type(self.current_playlist)}')
        self.load_current_playlist()
        logger.debug(f'调用 load_current_playlist 后，current_playlist 类型: {type(self.current_playlist)}')

        # 构建本地文件树
        try:
            self.local_file_tree = self.build_tree()
        except Exception as e:
            logger.warning(f"构建文件树失败: {e}")
            self.local_file_tree = {"name": "根目录", "rel": "", "dirs": [], "files": []}

        # 初始化 MPV IPC（只加载一次）
        self._init_mpv_ipc()

        # 初始化音频设备名映射表（GUID -> 设备友好名）
        self._audio_device_names = self._init_audio_device_map()

        # 外部依赖（通过 set_external_deps 注入，消除对 routers.state 的循环导入）
        self._ext_playlists_manager = None
        self._ext_default_playlist_id = None
        self._ext_playback_history = None
        self._ext_broadcast_from_thread = None

        logger.info(f"播放器初始化完成: music_dir={self.music_dir}, extensions={self.allowed_extensions}")

    def get_current_meta_snapshot(self) -> dict:
        """线程安全地获取 current_meta 的快照副本。

        current_meta 会被主线程、事件监听线程和标题获取线程并发读写，
        此方法在 RLock 保护下返回一份浅拷贝，避免读到不一致的状态。
        """
        with self._lock:
            return dict(self.current_meta) if self.current_meta else {}

    def set_external_deps(self, playlists_manager, default_playlist_id,
                          playback_history, broadcast_from_thread):
        """注入外部依赖，消除对 routers.state 的循环导入。

        参数:
            playlists_manager: Playlists 管理器实例
            default_playlist_id: 默认歌单 ID (字符串)
            playback_history: PlayHistory 播放历史实例
            broadcast_from_thread: 从后台线程触发 WebSocket 广播的回调函数
        """
        self._ext_playlists_manager = playlists_manager
        self._ext_default_playlist_id = default_playlist_id
        self._ext_playback_history = playback_history
        self._ext_broadcast_from_thread = broadcast_from_thread
        logger.info("[DI] ✓ 外部依赖已注入到 MusicPlayer")

    @classmethod
    def _init_shared_state(cls, instance, *, pipe_name: str, id_key: str,
                           playlists_manager, playback_history,
                           broadcast_from_thread, music_dir: str = "",
                           config_overrides: dict = None):
        """初始化 PipePlayer/RoomPlayer 共享的基础属性。

        参数:
            instance: object.__new__(cls) 创建的空实例
            pipe_name: MPV IPC 管道路径
            id_key: 用于生成 room_playlist_id 的标识符
            playlists_manager: 共享的 Playlists 管理器
            playback_history: 共享的 PlayHistory 实例
            broadcast_from_thread: WebSocket 广播回调
            music_dir: 音乐目录（可选）
            config_overrides: 额外的 config 字典项
        """
        instance.pipe_name = pipe_name
        instance.music_dir = music_dir
        instance.allowed_extensions = []
        instance.data_dir = ""
        instance.debug = False
        instance.local_search_max_results = 0
        instance.youtube_search_max_results = 20
        instance.youtube_url_extra_max = 50
        instance.server_host = "0.0.0.0"
        instance.server_port = 80

        # 播放状态
        instance.playlist = []
        instance.current_index = -1
        instance.current_meta = {}
        instance.loop_mode = 0
        instance.pitch_shift = 0
        instance._last_play_time = 0
        instance._prev_index = None
        instance._prev_meta = None
        instance._auto_thread = None
        instance._stop_flag = False
        instance._req_id = 0
        instance._lock = threading.RLock()

        # 共享资源（注入）
        instance._ext_playlists_manager = playlists_manager
        instance._ext_playback_history = playback_history
        instance._ext_broadcast_from_thread = broadcast_from_thread

        # 房间队列播放列表 ID
        safe_id = id_key.replace("\\", "_").replace(".", "_").replace(":", "_")
        instance._room_playlist_id = f"room_{safe_id}"
        instance._ext_default_playlist_id = instance._room_playlist_id

        # 共享播放历史
        instance.playback_history = playback_history
        instance.playback_history_file = ""
        instance.playback_history_max = 9999

        # 不构建本地文件树
        instance.local_file_tree = {"name": "N/A", "rel": "", "dirs": [], "files": []}
        instance._audio_device_names = {}
        instance.config = config_overrides or {}
        instance.current_playlist = None
        instance.current_playlist_file = ""

        # 自动创建房间队列播放列表（临时，不持久化）
        room_pl = playlists_manager.get_playlist(instance._room_playlist_id)
        if not room_pl:
            short_name = id_key.split("-")[-1][:12] if "-" in id_key else id_key[-12:]
            room_pl = Playlist(playlist_id=instance._room_playlist_id, name=f"Room {short_name}")
            playlists_manager._playlists[instance._room_playlist_id] = room_pl

    @classmethod
    def create_pipe_player(cls, pipe_name: str, playlists_manager,
                           playback_history, broadcast_from_thread=None,
                           music_dir: str = ""):
        """创建轻量级 PipePlayer 实例，连接到外部管理的 MPV 管道。

        PipePlayer 不启动 MPV 进程（管道由外部如 ClubVoice 管理），
        共享全局 PLAYLISTS_MANAGER 实现歌单共享，
        拥有独立的播放状态、队列和事件监听线程。

        参数:
            pipe_name: MPV IPC 管道路径（如 r'\\\\.\\pipe\\mpv-ipc-room1'）
            playlists_manager: 共享的 Playlists 管理器实例
            playback_history: 共享的 PlayHistory 实例
            broadcast_from_thread: WebSocket 广播回调（可选）
        """
        instance = object.__new__(cls)
        instance.mpv_cmd = None  # 标记：不启动 MPV
        instance.mpv_process = None

        cls._init_shared_state(
            instance,
            pipe_name=pipe_name,
            id_key=pipe_name,
            playlists_manager=playlists_manager,
            playback_history=playback_history,
            broadcast_from_thread=broadcast_from_thread,
            music_dir=music_dir,
        )

        # 启动管道事件监听线程
        instance._start_event_listener()

        logger.info(f"[PipePlayer] ✓ 已创建 PipePlayer: {pipe_name}")
        logger.info(f"[PipePlayer] 已创建房间临时播放列表: {instance._room_playlist_id}")
        return instance

    def destroy_pipe_player(self):
        """销毁 PipePlayer 实例，停止事件监听线程。"""
        self._stop_flag = True
        # 清理房间临时播放列表
        if self._ext_playlists_manager and hasattr(self, '_room_playlist_id'):
            self._ext_playlists_manager._playlists.pop(self._room_playlist_id, None)
            try:
                self._ext_playlists_manager._order.remove(self._room_playlist_id)
            except ValueError:
                pass
            logger.info(f"[PipePlayer] 已清理房间临时播放列表: {self._room_playlist_id}")
        logger.info(f"[PipePlayer] 已标记停止: {self.pipe_name}")

    # ===================== RoomPlayer =====================

    @classmethod
    def create_room_player(cls, room_id: str, playlists_manager,
                           playback_history, broadcast_from_thread=None,
                           default_volume: int = 80, music_dir: str = ""):
        """创建 RoomPlayer 实例 — ClubMusic 拥有并管理 MPV 进程 + PCM 音频中继。

        与 PipePlayer 的区别：RoomPlayer 自己启动 MPV（PCM stdout 模式），
        并通过 Named Pipe Server 把 PCM 数据传给 ClubVoice。

        参数:
            room_id: 房间 ID（如 'testbots_ef36'）
            playlists_manager: 共享的 Playlists 管理器实例
            playback_history: 共享的 PlayHistory 实例
            broadcast_from_thread: WebSocket 广播回调（可选）
            default_volume: MPV 默认音量 (0-100)
        """
        instance = object.__new__(cls)

        # RoomPlayer 专有：管道和 MPV 命令配置
        ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'
        pcm_pipe = rf'\\.\pipe\pcm-{room_id}'
        instance._room_id = room_id
        instance._pcm_pipe_name = pcm_pipe
        instance._default_volume = default_volume

        # MPV 命令: PCM 输出到 stdout（由 relay 线程转发到 Named Pipe）
        app_dir = MusicPlayer._get_app_dir()
        mpv_exe = os.path.join(app_dir, "bin", "mpv.exe")
        instance.mpv_cmd = (
            f'{mpv_exe}'
            f' --no-config'
            f' --input-ipc-server={ipc_pipe}'
            f' --ao=pcm --ao-pcm-file=- --ao-pcm-waveheader=no'
            f' --audio-samplerate=48000 --audio-channels=stereo --audio-format=s16'
            f' --idle=yes --force-window=no --no-video'
            f' --volume={default_volume}'
        )
        instance.mpv_process = None
        instance._pcm_pipe_server = None
        instance._relay_thread = None
        instance._client_acceptor_thread = None
        instance._relay_stop = threading.Event()
        instance._pcm_client_connected = threading.Event()

        # 共享基础属性（与 PipePlayer 相同）
        cls._init_shared_state(
            instance,
            pipe_name=ipc_pipe,
            id_key=room_id,
            playlists_manager=playlists_manager,
            playback_history=playback_history,
            broadcast_from_thread=broadcast_from_thread,
            music_dir=music_dir,
            config_overrides={"LOCAL_VOLUME": str(default_volume)},
        )

        logger.info(f"[RoomPlayer] ✓ 已创建 RoomPlayer: room_id={room_id}, ipc={ipc_pipe}, pcm={pcm_pipe}")
        logger.info(f"[RoomPlayer] 已创建房间临时播放列表: {instance._room_playlist_id}")
        return instance

    def start_room_mpv(self) -> bool:
        """启动 RoomPlayer 的 MPV 进程 + PCM relay。

        返回 True 表示 MPV 和 PCM pipe 均已就绪。
        """
        if not hasattr(self, '_room_id') or not self._room_id:
            logger.error("[RoomPlayer] start_room_mpv 仅用于 RoomPlayer 实例")
            return False

        if self.mpv_pipe_exists():
            logger.info(f"[RoomPlayer] MPV IPC 管道已存在: {self.pipe_name}")
            return True

        logger.info(f"[RoomPlayer] 启动 MPV: {self.mpv_cmd}")
        try:
            import shlex
            import ctypes as _ctypes
            CREATE_NEW_PROCESS_GROUP = 0x00000200
            CREATE_NO_WINDOW = 0x08000000

            cmd_list = shlex.split(self.mpv_cmd, posix=False)

            # 添加 yt-dlp 支持
            app_dir = MusicPlayer._get_app_dir()
            yt_dlp = os.path.join(app_dir, "bin", "yt-dlp.exe")
            if os.path.exists(yt_dlp):
                yt_path_escaped = os.path.abspath(yt_dlp).replace("\\", "/")
                cmd_list.append("--ytdl=yes")
                cmd_list.append(f'--script-opts=ytdl_hook-ytdl_path="{yt_path_escaped}"')
            else:
                cmd_list.append("--ytdl=yes")

            process = subprocess.Popen(
                cmd_list,
                shell=False,
                creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
                stdout=subprocess.PIPE,   # PCM 数据从 stdout 读取
                stderr=subprocess.PIPE,   # 捕获 stderr 用于诊断
                stdin=subprocess.DEVNULL,
            )
            self.mpv_process = process
            logger.info(f"[RoomPlayer] MPV 已启动 (PID={process.pid})")

            # 启动 stderr 读取线程（避免 stderr 缓冲区满阻塞 MPV）
            def _drain_stderr():
                try:
                    for line in process.stderr:
                        text = line.decode('utf-8', errors='replace').rstrip()
                        if text:
                            logger.info(f"[RoomPlayer MPV stderr] {text}")
                except Exception:
                    pass
            threading.Thread(target=_drain_stderr, daemon=True,
                           name=f"mpv-stderr-{self._room_id}").start()
        except Exception as e:
            logger.error(f"[RoomPlayer] MPV 启动失败: {e}")
            return False

        # 等待 IPC 管道就绪
        if not self._wait_pipe():
            logger.error(f"[RoomPlayer] IPC 管道超时: {self.pipe_name}")
            if self.mpv_process:
                rc = self.mpv_process.poll()
                if rc is not None:
                    logger.error(f"[RoomPlayer] MPV 已退出, returncode={rc}, cmd: {self.mpv_cmd}")
                else:
                    logger.error(f"[RoomPlayer] MPV 仍在运行 (PID={self.mpv_process.pid}) 但未创建管道")
            return False
        logger.info(f"[RoomPlayer] IPC 管道已就绪: {self.pipe_name}")

        # 启动 PCM relay 线程
        self._start_pcm_relay()

        # 启动事件监听线程
        self._start_event_listener()

        logger.info(f"[RoomPlayer] ✓ 房间 {self._room_id} MPV + PCM relay 已就绪")
        return True

    def _start_pcm_relay(self):
        """启动 PCM relay: 持续排空 MPV stdout，有客户端连接时转发到 Named Pipe。

        架构:
          - drain 线程: 始终读取 MPV stdout（防止缓冲区满导致 MPV 阻塞），
            有客户端时写入 PCM pipe，无客户端时丢弃数据。
          - acceptor 线程: 阻塞等待客户端连接/断开，管理 pipe 生命周期。
        """
        from models.pcm_pipe import PcmPipeServer

        self._relay_stop.clear()
        self._pcm_pipe_server = PcmPipeServer(self._pcm_pipe_name)

        # 客户端连接状态: set = 已连接, clear = 未连接
        self._pcm_client_connected.clear()
        client_connected = self._pcm_client_connected
        # pipe 创建就绪信号: drain 线程在写入前需确保 pipe 已创建
        pipe_ready = threading.Event()

        def _client_acceptor():
            """后台线程: 循环等待 PCM 客户端连接/断开。"""
            if not self._pcm_pipe_server.create():
                logger.error(f"[RoomPlayer] PCM 管道创建失败: {self._pcm_pipe_name}")
                return

            pipe_ready.set()

            while not self._relay_stop.is_set():
                logger.info(f"[RoomPlayer] 等待 PCM 客户端连接: {self._pcm_pipe_name}")
                if not self._pcm_pipe_server.wait_for_client():
                    if self._relay_stop.is_set():
                        break
                    # wait_for_client 失败但非停止信号 — 需要重建管道
                    logger.warning("[RoomPlayer] PCM 客户端连接失败，5 秒后重试...")
                    time.sleep(5)
                    self._pcm_pipe_server.close()
                    if self._relay_stop.is_set():
                        break
                    if not self._pcm_pipe_server.create():
                        logger.error(f"[RoomPlayer] PCM 管道重建失败: {self._pcm_pipe_name}")
                        break
                    continue

                logger.info(f"[RoomPlayer] PCM 客户端已连接: {self._pcm_pipe_name}")
                client_connected.set()

                # 等待客户端断开（drain 线程写入失败时会 clear）或停止信号
                while client_connected.is_set() and not self._relay_stop.is_set():
                    time.sleep(0.1)

                # 准备接受下一个客户端
                self._pcm_pipe_server.disconnect_client()
                if not self._relay_stop.is_set():
                    logger.info("[RoomPlayer] PCM 客户端断开，等待下一个...")

            self._pcm_pipe_server.close()
            logger.info(f"[RoomPlayer] PCM acceptor 线程结束: {self._pcm_pipe_name}")

        def _drain_loop():
            """主 relay 线程: 持续读取 MPV stdout，有客户端时转发，无客户端时丢弃。

            关键: --ao=pcm 以 CPU 全速解码，无实时节拍。
            必须在此线程中手动节拍控制，通过限制 read() 速率
            来反压 MPV stdout pipe buffer，使 MPV 被节流到实时速度。
            """
            FRAME_BYTES = 3840  # 960 samples × 2ch × 2bytes = 20ms @ 48kHz
            FRAME_DURATION = FRAME_BYTES / (48000 * 2 * 2)  # ~0.02s (20ms)

            # 等待管道创建就绪（最多 10 秒）
            if not pipe_ready.wait(timeout=10):
                logger.error("[RoomPlayer] PCM 管道创建超时，drain 线程退出")
                return

            logger.info("[RoomPlayer drain] 线程就绪，开始读取 MPV stdout")
            total_bytes = 0
            total_frames = 0
            forwarded_frames = 0
            discarded_frames = 0
            first_data_logged = False
            play_start_time = None  # 第一帧到达时开始计时

            while not self._relay_stop.is_set():
                try:
                    data = self.mpv_process.stdout.read(FRAME_BYTES)
                    if not data:
                        logger.info(f"[RoomPlayer drain] MPV stdout EOF "
                                    f"(总共读取: {total_bytes} bytes, {total_frames} 帧, "
                                    f"转发: {forwarded_frames}, 丢弃: {discarded_frames})")
                        play_start_time = None  # 重置，为下一首准备
                        break

                    total_bytes += len(data)
                    total_frames += 1

                    # 实时节拍控制: 第一帧开始计时，后续帧按 20ms/帧 节奏
                    if play_start_time is None:
                        play_start_time = time.monotonic()
                    else:
                        expected_time = play_start_time + total_frames * FRAME_DURATION
                        now = time.monotonic()
                        if expected_time > now:
                            time.sleep(expected_time - now)

                    if not first_data_logged:
                        first_data_logged = True
                        logger.info(f"[RoomPlayer drain] 首次收到 PCM 数据: {len(data)} bytes, "
                                    f"client_connected={client_connected.is_set()}")

                    if client_connected.is_set():
                        if not self._pcm_pipe_server.write(data):
                            # 写入失败 = 客户端断开，通知 acceptor
                            client_connected.clear()
                            logger.info(f"[RoomPlayer drain] PCM 写入失败，客户端已断开 "
                                        f"(已转发 {forwarded_frames} 帧)")
                        else:
                            forwarded_frames += 1
                    else:
                        discarded_frames += 1

                    # 每 5 秒输出一次统计（约 250 帧 @ 20ms/帧）
                    if total_frames % 250 == 0:
                        logger.info(f"[RoomPlayer drain] 统计: {total_bytes} bytes, "
                                    f"转发={forwarded_frames}, 丢弃={discarded_frames}, "
                                    f"client={client_connected.is_set()}")

                except Exception as e:
                    if not self._relay_stop.is_set():
                        logger.warning(f"[RoomPlayer drain] stdout 读取异常: {e}")
                    break

            logger.info("[RoomPlayer drain] 线程结束")

        # 启动 acceptor 线程（管理 pipe 生命周期 + 客户端连接）
        self._client_acceptor_thread = threading.Thread(
            target=_client_acceptor, daemon=True,
            name=f"pcm-acceptor-{self._room_id}"
        )
        self._client_acceptor_thread.start()

        # 启动 drain 线程（始终排空 MPV stdout）
        self._relay_thread = threading.Thread(
            target=_drain_loop, daemon=True,
            name=f"pcm-relay-{self._room_id}"
        )
        self._relay_thread.start()

    def destroy_room_player(self):
        """销毁 RoomPlayer: 停止 relay、杀 MPV、清理管道。"""
        room_id = getattr(self, '_room_id', '?')
        logger.info(f"[RoomPlayer] 正在销毁: {room_id}")

        # 1. 停止事件监听
        self._stop_flag = True

        # 2. 发送停止信号
        if hasattr(self, '_relay_stop'):
            self._relay_stop.set()

        # 3. 取消 acceptor 线程的阻塞等待（关闭 pipe 句柄以解除 ConnectNamedPipe 阻塞）
        if self._pcm_pipe_server:
            self._pcm_pipe_server.cancel_wait()

        # 4. 杀 MPV 进程（关闭 stdout 让 drain 线程退出阻塞读）
        if self.mpv_process:
            try:
                self.mpv_process.terminate()
                self.mpv_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.mpv_process.kill()
                self.mpv_process.wait(timeout=2)
            except Exception as e:
                logger.warning(f"[RoomPlayer] 杀 MPV 异常: {e}")
            finally:
                self.mpv_process = None

        # 5. 等待 drain 线程退出
        if self._relay_thread and self._relay_thread.is_alive():
            self._relay_thread.join(timeout=3)
            self._relay_thread = None

        # 6. 等待 acceptor 线程退出
        if self._client_acceptor_thread and self._client_acceptor_thread.is_alive():
            self._client_acceptor_thread.join(timeout=3)
            self._client_acceptor_thread = None

        # 7. 确保 PCM pipe 已关闭（acceptor 线程正常退出时会关闭，这里是安全兜底）
        if self._pcm_pipe_server:
            self._pcm_pipe_server.close()
            self._pcm_pipe_server = None

        # 8. 清理房间临时播放列表
        if self._ext_playlists_manager and hasattr(self, '_room_playlist_id'):
            self._ext_playlists_manager._playlists.pop(self._room_playlist_id, None)
            try:
                self._ext_playlists_manager._order.remove(self._room_playlist_id)
            except ValueError:
                pass
            logger.info(f"[RoomPlayer] 已清理房间临时播放列表: {self._room_playlist_id}")

        logger.info(f"[RoomPlayer] ✓ 已销毁: {room_id}")

    def _init_audio_device_map(self) -> dict:
        """初始化音频设备 GUID 到设备名的映射表
        
        返回:
            {"d90d29b4-4976-44b8-900f-915b7d2bc58c": "VB-Cable Output", ...}
        """
        # 常见的 GUID 映射（Windows 音频设备）
        known_devices = {
            # VB-Cable 虚拟音频设备
            "d90d29b4-4976-44b8-900f-915b7d2bc58c": "VB-Cable Output",
            # 添加其他已知设备的映射（可根据需要扩展）
        }
        
        # 尝试从注册表获取更多设备信息（Windows 特定）
        try:
            import winreg
            reg_path = r"Software\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render"
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path) as key:
                    for i in range(winreg.QueryInfoKey(key)[0]):
                        try:
                            subkey_name = winreg.EnumKey(key, i)
                            with winreg.OpenKey(key, f"{subkey_name}\\Properties") as subkey:
                                try:
                                    friendly_name, _ = winreg.QueryValueEx(subkey, "{b3f8fa53-0004-438e-9003-51a46e139bfc},2")
                                    if friendly_name:
                                        known_devices[subkey_name.lower()] = friendly_name
                                except OSError:
                                    pass
                        except OSError:
                            pass
            except OSError:
                pass
        except ImportError:
            # Windows Registry 模块在非 Windows 系统不可用
            pass
        
        return known_devices

    def get_audio_device_name(self) -> str:
        """获取当前音频设备名称
        
        从 mpv_cmd 中解析 --audio-device 参数，返回对应的设备友好名
        
        返回:
            设备名称（如 "VB-Cable Output"），未找到则返回 "System Default"
        """
        try:
            if not self.mpv_cmd:
                return "System Default"
            
            # 提取 --audio-device 参数值
            import re
            match = re.search(r'--audio-device=([^\s]+)', self.mpv_cmd)
            if not match:
                return "System Default"
            
            device_id = match.group(1).strip()
            
            # 如果是 wasapi/{GUID} 格式，提取 GUID
            if device_id.startswith("wasapi/{"):
                guid = device_id.replace("wasapi/{", "").rstrip("}")
            else:
                guid = device_id
            
            # 从映射表查找设备名
            device_name = self._audio_device_names.get(guid.lower())
            if device_name:
                return device_name
            
            # 未找到映射，返回缩写的 GUID（前 8 位）
            return f"Device ({guid[:8]})" if guid else "Unknown"
            
        except Exception as e:
            logger.debug(f"获取音频设备名失败: {e}")
            return "Unknown"

    @classmethod
    def initialize(cls, data_dir: str = "."):
        """初始化播放器 - 确保配置文件存在，然后创建并返回播放器实例

        这是在主程序中调用的单一入口点，处理所有初始化逻辑

        参数:
          data_dir: 数据文件存储目录

        返回:
          已初始化的 MusicPlayer 实例
        """
        # 确保配置文件存在
        ini_path = cls._get_default_ini_path()
        cls.ensure_ini_exists(ini_path)

        # 从配置文件创建播放器实例
        player = cls.from_ini_file(ini_path, data_dir=data_dir)

        logger.info("播放器已初始化，所有模块就绪")
        return player

    @classmethod
    def from_ini_file(cls, ini_path: str, data_dir: str = "."):
        """从INI配置文件创建播放器实例

        参数:
          ini_path: 配置文件路径
          data_dir: 数据文件存储目录

        返回:
          MusicPlayer 实例
        """
        logger.info(f"开始加载配置文件")
        logger.debug(f"配置文件路径: {ini_path}")
        cfg = cls._read_ini_file(ini_path)
        app_dir = MusicPlayer._get_app_dir()
        
        logger.debug(f"解析后的配置内容:")
        for key, value in cfg.items():
            if key == "MPV_CMD":
                logger.debug(f" {key}: {value[:60]}..." if value and len(str(value)) > 60 else f"  {key}: {value}")
            else:
                logger.debug(f" {key}: {value}")
        
        # 提取配置参数
        music_dir = cfg.get("MUSIC_DIR", cls.DEFAULT_CONFIG["MUSIC_DIR"])
        allowed_ext = cfg.get(
            "ALLOWED_EXTENSIONS", cls.DEFAULT_CONFIG["ALLOWED_EXTENSIONS"]
        )
        server_host = cfg.get("SERVER_HOST", cls.DEFAULT_CONFIG["SERVER_HOST"])
        server_port_str = cfg.get("SERVER_PORT", cls.DEFAULT_CONFIG["SERVER_PORT"])
        debug_str = cfg.get("DEBUG", cls.DEFAULT_CONFIG["DEBUG"])
        debug_flag = debug_str.lower() in ("true", "1", "yes")
        mpv_cmd = cfg.get("MPV_CMD")
        
        # 规范化 MPV 命令中的相对路径
        if mpv_cmd:
            mpv_cmd = cls._normalize_mpv_cmd(mpv_cmd, app_dir)
        
        logger.info(f"配置参数摘要:")
        logger.info(f" MUSIC_DIR: {music_dir}")
        logger.info(f" ALLOWED_EXTENSIONS: {allowed_ext}")
        logger.info(f" SERVER_HOST: {server_host}")
        logger.info(f" SERVER_PORT: {server_port_str}")
        logger.info(f" DEBUG: {debug_flag} (原始值: {debug_str})")
        logger.info(f" MPV_CMD: {'已配置' if mpv_cmd else '使用默认'}")
        
        local_search_max = cfg.get("LOCAL_SEARCH_MAX_RESULTS", cls.DEFAULT_CONFIG["LOCAL_SEARCH_MAX_RESULTS"])
        youtube_search_max = cfg.get("YOUTUBE_SEARCH_MAX_RESULTS", cls.DEFAULT_CONFIG["YOUTUBE_SEARCH_MAX_RESULTS"])
        youtube_url_extra_max = cfg.get("YOUTUBE_URL_EXTRA_MAX", cls.DEFAULT_CONFIG["YOUTUBE_URL_EXTRA_MAX"])
        playback_history_max = cfg.get("PLAYBACK_HISTORY_MAX", cls.DEFAULT_CONFIG.get("PLAYBACK_HISTORY_MAX", 9999))
        logger.info(f"  LOCAL_SEARCH_MAX_RESULTS: {local_search_max}")
        logger.info(f"  YOUTUBE_SEARCH_MAX_RESULTS: {youtube_search_max}")
        logger.info(f"  YOUTUBE_URL_EXTRA_MAX: {youtube_url_extra_max}")
        logger.info(f"===== 配置加载完成 =====\n")

        player = cls(
            music_dir=music_dir,
            allowed_extensions=allowed_ext,
            server_host=server_host,
            server_port=int(server_port_str),
            debug=debug_flag,
            mpv_cmd=mpv_cmd,
            data_dir=data_dir,
            local_search_max_results=local_search_max,
            youtube_search_max_results=youtube_search_max,
            youtube_url_extra_max=youtube_url_extra_max,
            playback_history_max=playback_history_max,
        )
        
        # 保存完整配置供后续使用（路径、FFmpeg参数等）
        player.config = cfg
        
        return player


    @staticmethod
    def _read_ini_file(ini_path: str) -> dict:
        """读取INI配置文件"""
        cfg = MusicPlayer.DEFAULT_CONFIG.copy()
        try:
            parser = configparser.ConfigParser()
            parser.read(ini_path, encoding="utf-8")
            if "app" in parser:
                for key, value in parser["app"].items():
                    cfg[key.upper()] = value
            try:
                logger.info(f"已从 {ini_path} 加载配置")
            except UnicodeEncodeError:
                logger.info(f"Loaded config from {ini_path}")
        except Exception as e:
            try:
                logger.warning(f"读取配置文件失败: {e}，使用默认配置")
            except UnicodeEncodeError:
                logger.warning(f"Failed to read config file: {e}, using default")
        return cfg

    @staticmethod
    def save_config_to_ini(ini_path: str, config: dict):
        """将配置保存为INI文件

        参数:
          ini_path: 输出文件路径
          config: 配置字典
        """
        parser = configparser.ConfigParser()
        parser["app"] = {}
        for key, value in config.items():
            parser["app"][key] = str(value) if value is not None else ""

        try:
            with open(ini_path, "w", encoding="utf-8") as f:
                parser.write(f)
            logger.info(f"配置已保存到 {ini_path}")
        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")


    def _normalize_music_dir(self, path: str) -> str:
        """规范化音乐目录路径"""
        if len(path) == 2 and path[1] == ":" and path[0].isalpha():
            path += "\\"
        return os.path.abspath(path)

    def _parse_extensions(self, ext_str: str) -> set:
        """解析扩展名字符串"""
        if isinstance(ext_str, str):
            parts = [
                e.strip() for e in ext_str.replace(";", ",").split(",") if e.strip()
            ]
        else:
            parts = list(ext_str)
        return set([e if e.startswith(".") else "." + e for e in parts])

    def load_playback_history(self):
        """从文件加载播放历史"""
        self.playback_history.load()

    def save_playback_history(self):
        """保存播放历史到文件"""
        self.playback_history.save()

    def load_current_playlist(self):
        """从文件加载当前播放列表"""
        import traceback
        try:
            if os.path.exists(self.current_playlist_file):
                with open(self.current_playlist_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.current_playlist.from_dict(data)
                        logger.info(f"已加载播放列表: {self.current_playlist.size()} 首歌曲")
                    else:
                        from models import CurrentPlaylist
                        self.current_playlist = CurrentPlaylist()
            else:
                from models import CurrentPlaylist
                self.current_playlist = CurrentPlaylist()
        except Exception as e:
            logger.error(f"加载播放列表失败: {e}")
            traceback.print_exc()
            from models import CurrentPlaylist
            self.current_playlist = CurrentPlaylist()

    def save_current_playlist(self):
        """保存当前播放列表到文件"""
        try:
            data = self.current_playlist.to_dict()
            with open(self.current_playlist_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存播放列表失败: {e}")

    # ========== MPV IPC 初始化方法 ==========

    def _init_mpv_ipc(self):
        """初始化 MPV IPC 连接（在播放器初始化时只调用一次）"""
        self._extract_pipe_name_from_cmd()
        self.ensure_mpv()
        # 启动 MPV 事件监听线程（用于服务端自动播放）
        self._start_event_listener()

    def _extract_pipe_name_from_cmd(self):
        """从 MPV 命令行中提取管道名称"""
        if not self.mpv_cmd:
            self.pipe_name = r"\\.\pipe\mpv-pipe"  # 默认管道名称
            return

        match = re.search(
            r'--input-ipc-server\s*=?\s*(["\']?)(.+?)\1(?:\s|$)', self.mpv_cmd
        )
        if match:
            self.pipe_name = match.group(2)
        else:
            self.pipe_name = r"\\.\pipe\mpv-pipe"  # 默认管道名称

    def _start_event_listener(self):
        """启动后台线程监听 MPV 事件（用于服务端自动播放）"""
        def event_listener_thread():
            """后台线程：监听 MPV IPC 管道上的事件"""
            logger.info("🎵 [事件监听] 后台线程已启动")
            
            consecutive_errors = 0
            max_consecutive_errors = 10
            
            while not self._stop_flag:
                # 等待管道就绪再尝试连接，避免管道未创建时反复报错
                if not os.path.exists(self.pipe_name):
                    self._wait_pipe(timeout=30)
                    if self._stop_flag:
                        break
                    if not os.path.exists(self.pipe_name):
                        continue
                try:
                    # 从管道读取事件
                    with open(self.pipe_name, "r", encoding="utf-8") as pipe:
                        consecutive_errors = 0
                        for line in pipe:
                            try:
                                event_data = json.loads(line.strip())
                                
                                # 处理 end-file 事件
                                if event_data.get("event") == "end-file":
                                    reason = event_data.get("reason", "")
                                    logger.info(f"[事件监听] 🛑 检测到 end-file 事件，reason: {reason}")
                                    
                                    # 仅在正常播放结束时触发自动播放
                                    if reason == "eof":
                                        logger.info("[事件监听] ✓ 检测到歌曲播放结束（EOF），触发自动播放")
                                        try:
                                            self.handle_playback_end()
                                        except Exception as e:
                                            logger.error(f"[事件监听] ✗ 处理播放结束失败: {e}")
                                    elif reason == "error":
                                        file_error = event_data.get("file_error", "unknown")
                                        logger.warning(f"[事件监听] ⚠ 播放出错: {file_error}, 完整事件: {event_data}")

                                        # --- RoomPlayer 专项诊断 ---
                                        if hasattr(self, '_room_id'):
                                            try:
                                                current_url = self.current_meta.get("url", "")
                                                logger.warning(
                                                    f"[RoomPlayer 诊断] room_id={self._room_id}, "
                                                    f"file_error={file_error}"
                                                )
                                                # 本地文件: 检查路径和文件存在性
                                                if current_url and not current_url.startswith(("http://", "https://")):
                                                    if os.path.isabs(current_url):
                                                        check_path = os.path.normpath(current_url)
                                                    else:
                                                        check_path = os.path.normpath(
                                                            os.path.join(self.music_dir, current_url)
                                                        )
                                                    exists = os.path.exists(check_path)
                                                    logger.warning(
                                                        f"[RoomPlayer 诊断] 文件路径: {check_path}, "
                                                        f"存在: {exists}, music_dir: {self.music_dir}"
                                                    )
                                                    if exists:
                                                        size = os.path.getsize(check_path)
                                                        logger.warning(f"[RoomPlayer 诊断] 文件大小: {size} bytes")
                                                    else:
                                                        parent = os.path.dirname(check_path)
                                                        logger.warning(
                                                            f"[RoomPlayer 诊断] 父目录存在: {os.path.exists(parent)}, "
                                                            f"父目录: {parent}"
                                                        )
                                                # MPV 进程状态
                                                if self.mpv_process:
                                                    poll = self.mpv_process.poll()
                                                    logger.warning(
                                                        f"[RoomPlayer 诊断] MPV PID={self.mpv_process.pid}, "
                                                        f"running={poll is None}"
                                                        f"{f', exit_code={poll}' if poll is not None else ''}"
                                                    )
                                            except Exception as diag_err:
                                                logger.debug(f"[RoomPlayer 诊断] 诊断代码异常: {diag_err}")

                                        # 播放出错，主动失效当前歌曲的缓存 URL，避免下次重复使用损坏的直链
                                        try:
                                            from models.url_cache import url_cache
                                            video_id = self.current_meta.get("video_id")
                                            if video_id:
                                                url_cache.invalidate(video_id)
                                                logger.info(f"[事件监听] 播放出错，已失效缓存: {video_id}")
                                        except Exception as e:
                                            logger.debug(f"[事件监听] 缓存失效异常（无害）: {e}")
                                    
                            except json.JSONDecodeError:
                                # 跳过不是有效 JSON 的行（例如不相关的输出）
                                pass
                            except Exception as e:
                                logger.warning(f"[事件监听] ⚠️ 处理事件异常: {e}")
                
                except (FileNotFoundError, IOError) as e:
                    consecutive_errors += 1
                    if consecutive_errors > max_consecutive_errors:
                        logger.warning("[事件监听] ⚠️ 连续错误过多，等待 10 秒后重试...")
                        consecutive_errors = 0
                        time.sleep(10)
                    else:
                        logger.debug(f"[事件监听] 管道不可用或已关闭 (尝试 {consecutive_errors}/{max_consecutive_errors}): {e}")
                        time.sleep(0.5)
                except Exception as e:
                    logger.error(f"[事件监听] 异常: {e}")
                    time.sleep(1)

        # 启动守护线程
        listener_thread = threading.Thread(target=event_listener_thread, daemon=True, name="MPVEventListener")
        listener_thread.start()
        logger.info("[事件监听] ✓ 事件监听器线程已启动")

    def handle_playback_end(self):
        """处理歌曲播放结束事件（后端完全控制自动播放）

        说明：
        - 此方法被后台事件监听线程调用（detect end-file 事件）
        - 直接在后端完成自动播放逻辑：删除当前歌曲+播放下一首
        - 前端只负责状态显示，不再参与自动播放控制
        - 删除当前播放的歌曲（通过URL匹配），然后播放列表顶部

        实现完整的后端控制自动播放流程
        """
        try:
            # 使用注入的外部依赖（由 set_external_deps 提供，无需循环导入 routers.state）
            playlists_mgr = self._ext_playlists_manager
            default_pid = self._ext_default_playlist_id
            ext_history = self._ext_playback_history

            if playlists_mgr is None or default_pid is None:
                logger.warning("[自动播放] ⚠️ 外部依赖未注入，跳过自动播放")
                return

            logger.info("[自动播放] ✓ 检测到歌曲播放结束，开始后端自动播放逻辑")

            auto_play_success = False

            with self._lock:
                # 获取默认歌单（当前播放队列）
                default_playlist = playlists_mgr.get_playlist(default_pid)
                if not default_playlist or len(default_playlist.songs) == 0:
                    logger.info(f"[自动播放] ⚠️ 歌单 '{default_pid}' 为空，停止自动播放")
                    return

                # 删除当前播放的歌曲（通过URL匹配）
                current_playing_url = self.current_meta.get("url") or self.current_meta.get("rel") or self.current_meta.get("raw_url")
                current_playing_title = self.current_meta.get("title") or "未知歌曲"
                removed_index = -1

                if current_playing_url:
                    # 根据URL查找并删除当前播放的歌曲
                    for idx, song in enumerate(default_playlist.songs):
                        song_url = song.get("url") if isinstance(song, dict) else str(song)
                        if song_url == current_playing_url:
                            removed_index = idx
                            break

                if removed_index >= 0:
                    # 找到了匹配的歌曲，删除它
                    removed_song = default_playlist.songs.pop(removed_index)
                    default_playlist.updated_at = time.time()
                    playlists_mgr.save()

                    song_title = removed_song.get('title') if isinstance(removed_song, dict) else str(removed_song)
                    logger.info(f"[自动播放] ✓ 已删除播放完毕的歌曲 (索引{removed_index}): {song_title}")
                else:
                    # 未找到匹配的歌曲，默认删除第一首
                    logger.warning(f"[自动播放] ⚠️ 未找到匹配的歌曲 ({current_playing_url})，删除列表第一首")
                    if len(default_playlist.songs) > 0:
                        removed_song = default_playlist.songs.pop(0)
                        default_playlist.updated_at = time.time()
                        playlists_mgr.save()
                        song_title = removed_song.get('title') if isinstance(removed_song, dict) else str(removed_song)
                        logger.info(f"[自动播放] ✓ 已删除列表第一首: {song_title}")

                # 播放下一首（删除后的第一首），跳过失败歌曲（最多5首）
                MAX_SKIP = 5
                for attempt in range(MAX_SKIP):
                    if not default_playlist.songs:
                        break

                    next_song = default_playlist.songs[0]

                    if isinstance(next_song, dict):
                        url = next_song.get("url")
                        title = next_song.get("title") or url
                        song_type = next_song.get("type", "local")
                        duration = next_song.get("duration", 0)
                    else:
                        url = str(next_song)
                        title = os.path.basename(url)
                        song_type = "local"
                        duration = 0

                    if not url:
                        skipped = default_playlist.songs.pop(0)
                        default_playlist.songs.append(skipped)
                        logger.warning(f"[自动播放] 跳过数据不完整的歌曲 ({attempt+1}/{MAX_SKIP}): {title}")
                        continue

                    logger.info(f"[自动播放] ▶️ 尝试播放下一首 ({attempt+1}/{MAX_SKIP}): {title}")

                    # 根据歌曲类型创建Song对象并播放
                    if song_type == "youtube" or (url and str(url).startswith("http")):
                        from models.song import StreamSong
                        song = StreamSong(stream_url=url, title=title, duration=duration)
                    else:
                        from models.song import LocalSong
                        song = LocalSong(file_path=url, title=title)

                    # 播放歌曲
                    add_history_func = ext_history.add_to_history if ext_history else self.add_to_playback_history
                    success = song.play(
                        mpv_command_func=self.mpv_command,
                        mpv_pipe_exists_func=self.mpv_pipe_exists,
                        ensure_mpv_func=self.ensure_mpv,
                        add_to_history_func=add_history_func,
                        save_to_history=True,
                        music_dir=self.music_dir
                    )

                    if success:
                        # 更新当前播放元数据
                        self.current_meta = song.to_dict()
                        self.current_index = 0  # 重置为第一首
                        self._last_play_time = time.time()
                        auto_play_success = True
                        logger.info(f"[自动播放] ✅ 自动播放成功: {title}")
                        # 预获取下一曲直链
                        self._prefetch_next_song_url()
                        break
                    else:
                        # 播放失败：移到队尾保留，继续尝试下一首
                        skipped = default_playlist.songs.pop(0)
                        default_playlist.songs.append(skipped)
                        logger.warning(f"[自动播放] 跳过失败歌曲 ({attempt+1}/{MAX_SKIP}): {title}")

                # 无论成功失败都保存
                default_playlist.updated_at = time.time()
                playlists_mgr.save()

                if not auto_play_success and not default_playlist.songs:
                    logger.info("[自动播放] ℹ️ 播放列表已空，停止自动播放")
                    # 清空当前播放信息
                    self.current_meta = {}
                    self.current_index = -1
                elif not auto_play_success:
                    logger.error(f"[自动播放] ❌ 连续 {MAX_SKIP} 首播放失败")

            # 锁外广播（_build_state_message 需要读 MPV 管道，不能在锁内执行）
            if auto_play_success and self._ext_broadcast_from_thread:
                self._ext_broadcast_from_thread()

        except Exception as e:
            logger.error(f"[自动播放] ❌ 后端自动播放异常: {e}")
            import traceback
            traceback.print_exc()

    def mpv_pipe_exists(self) -> bool:
        """检查 MPV 管道是否存在（仅在 Windows 上检查）"""
        if not self.pipe_name:
            return False
        return os.path.exists(self.pipe_name)

    def _wait_pipe(self, timeout=6.0) -> bool:
        """等待 MPV 管道就绪"""
        end = time.time() + timeout
        while time.time() < end:
            if os.path.exists(self.pipe_name):
                return True
            # 检测 MPV 是否已退出，避免无意义等待
            if self.mpv_process and self.mpv_process.poll() is not None:
                rc = self.mpv_process.returncode
                logger.error(f"MPV 进程已退出 (returncode={rc})，停止等待管道")
                return False
            time.sleep(0.15)
        return False

    def ensure_mpv(self) -> bool:
        """确保 MPV 进程运行并且 IPC 管道就绪

        返回:
          True 如果 mpv 管道可用，False 否则
        """
        # PipePlayer 模式：不启动 MPV，只检查管道是否存在
        if self.mpv_cmd is None:
            return self.mpv_pipe_exists()

        # RoomPlayer 模式：MPV 由 start_room_mpv() 管理，不走默认重启逻辑
        if hasattr(self, '_room_id') and self._room_id:
            return self.mpv_pipe_exists()

        # 每次调用重新解析，允许运行期间修改 MPV_CMD 并热加载
        self._extract_pipe_name_from_cmd()

        if not self.mpv_cmd:
            logger.warning("未配置 MPV_CMD")
            return False

        if self.mpv_pipe_exists():
            return True

        # MPV 进程仍然存活时，等待管道恢复，不要直接 taskkill
        if self.mpv_process and self.mpv_process.poll() is None:
            logger.info(f"MPV 进程存活 (PID={self.mpv_process.pid})，等待管道恢复...")
            if self._wait_pipe(timeout=5):
                return True
            logger.warning(f"MPV 进程存活但管道始终不可用，将重启 MPV")

        # 清理当前持有的 mpv 进程，防止重复启动
        try:
            if self.mpv_process and self.mpv_process.poll() is None:
                pid = self.mpv_process.pid
                logger.info(f"终止当前 MPV 进程 (PID={pid})...")
                self.mpv_process.terminate()
                try:
                    self.mpv_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.mpv_process.kill()
                    self.mpv_process.wait(timeout=2)
                self.mpv_process = None
                time.sleep(0.3)  # 让进程完全退出
        except Exception as e:
            logger.debug(f"清理 mpv 进程时的异常（可忽略）: {e}")

        logger.info(f"尝试启动 mpv: {self.mpv_cmd}")
        try:
            # 主程序目录下的 bin 子目录中查找 yt-dlp
            app_dir = MusicPlayer._get_app_dir()
            yt_dlp_path = None
            
            bin_yt_dlp = os.path.join(app_dir, "bin", "yt-dlp.exe")
            if os.path.exists(bin_yt_dlp):
                yt_dlp_path = bin_yt_dlp
                logger.info(f"在主程序目录 {app_dir}\\bin 找到 yt-dlp: {bin_yt_dlp}")
            
            # 构建完整的启动命令
            mpv_launch_cmd = self.mpv_cmd
            
            # 【新增】检查环境变量中是否有运行时选择的音频设备
            runtime_audio_device = os.environ.get("MPV_AUDIO_DEVICE", "")
            if runtime_audio_device:
                # 移除现有的 --audio-device 参数
                import re
                mpv_launch_cmd = re.sub(r'\s*--audio-device=[^\s]+', '', mpv_launch_cmd)
                mpv_launch_cmd = mpv_launch_cmd.strip() + f" --audio-device={runtime_audio_device}"
                logger.info(f"使用运行时选择的音频设备: {runtime_audio_device}")
            
            # 确保启用 mpv 的 ytdl 集成
            if "--ytdl=" not in mpv_launch_cmd:
                mpv_launch_cmd += " --ytdl=yes"
            if yt_dlp_path:
                # 转换为绝对路径并设置环境变量（提高兼容性）
                abs_yt_dlp_path = os.path.abspath(yt_dlp_path)
                os.environ['YT_DLP_PATH'] = abs_yt_dlp_path
                # 将路径中的反斜杠转换为正斜杠，避免转义问题
                yt_dlp_path_escaped = abs_yt_dlp_path.replace("\\", "/")
                mpv_launch_cmd += f' --script-opts=ytdl_hook-ytdl_path="{yt_dlp_path_escaped}"'
                logger.info(f"配置 MPV 使用 yt-dlp (绝对路径+环境变量): {abs_yt_dlp_path}")
            else:
                logger.info(f"未找到 yt-dlp，将使用系统 PATH")
            
            # ✅ 显示完整的启动命令（多种格式）
            logger.info("=" * 120)
            logger.info("🚀 MPV 完整启动命令")
            logger.info("=" * 120)
            
            # 格式 1：完整单行命令
            logger.info("")
            logger.info("[完整命令行]")
            logger.info(mpv_launch_cmd)
            logger.info("")
            
            # 格式 2：按参数分解显示（更详细）
            logger.info("[执行参数分解]")
            import shlex
            try:
                # 使用 shlex 进行参数分解（Windows 模式）
                # 在 Windows 上，shlex 默认 posix=False，但需要明确设置
                parsed_args = shlex.split(mpv_launch_cmd, posix=False)
                logger.info(f"  程序路径: {parsed_args[0]}")
                logger.info(f"  总参数数: {len(parsed_args) - 1}")
                logger.info("")
                
                # 逐个显示每个参数
                for idx, arg in enumerate(parsed_args[1:], 1):
                    # 格式化参数显示
                    if "=" in arg and arg.startswith("--"):
                        # 参数形式: --key=value
                        parts = arg.split("=", 1)
                        logger.info(f"  [{idx:2d}] {parts[0]} = {parts[1]}")
                    elif arg.startswith("--"):
                        # 参数形式: --key
                        logger.info(f"  [{idx:2d}] {arg}")
                    elif arg.startswith("-"):
                        # 短参数
                        logger.info(f"  [{idx:2d}] {arg}")
                    else:
                        # 值参数（通常跟在某个参数后）
                        logger.info(f"  [{idx:2d}] {arg}")
            except Exception as e:
                logger.warning(f"参数分解异常: {e}，显示原始命令")
                logger.info(mpv_launch_cmd)
            
            logger.info("")
            logger.info("=" * 120)
            
            # 在 Windows 上使用 CREATE_NEW_PROCESS_GROUP 标志来避免进程被挂起
            import ctypes
            import shlex
            CREATE_NEW_PROCESS_GROUP = 0x00000200
            CREATE_NO_WINDOW = 0x08000000
            
            try:
                # 方法 1: 使用 shlex 解析命令字符串为列表，然后用 Popen
                # 重要：在 Windows 上使用 posix=False 避免反斜杠被当作转义字符
                cmd_list = shlex.split(mpv_launch_cmd, posix=False)
                mpv_exe_path = cmd_list[0]
                
                # 验证 MPV 可执行文件是否存在
                if not os.path.exists(mpv_exe_path):
                    # 尝试在 PATH 中查找
                    import shutil
                    mpv_in_path = shutil.which(mpv_exe_path)
                    if mpv_in_path:
                        logger.info(f"✅ 在 PATH 中找到 MPV: {mpv_in_path}")
                        cmd_list[0] = mpv_in_path
                    else:
                        logger.error(f"❌ MPV 可执行文件未找到: {mpv_exe_path}")
                        logger.error(f"请检查 settings.ini 中的 mpv_cmd 配置")
                        raise FileNotFoundError(f"MPV not found: {mpv_exe_path}")

                logger.info(f"✅ 启动mpv进程")
                logger.debug(f"  命令列表: {cmd_list}")
                process = subprocess.Popen(
                    cmd_list,
                    shell=False,
                    creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                self.mpv_process = process
                logger.info(f"✅ mpv进程已启动 (PID: {process.pid})")
            except Exception as e2:
                logger.error(f"❌ 启动 MPV 失败: {e2}")
                logger.error(f"请检查 MPV 路径配置: {self.mpv_cmd}")
                raise
        except Exception as e:
            logger.error(f"启动 mpv 进程失败: {e}")
            return False

        ready = self._wait_pipe(timeout=15)
        if not ready:
            logger.error(f"等待 mpv 管道超时: {self.pipe_name}")
            if self.mpv_process:
                rc = self.mpv_process.poll()
                if rc is not None:
                    logger.error(f"MPV 已退出, returncode={rc}, cmd: {self.mpv_cmd}")
                else:
                    logger.error(f"MPV 仍在运行 (PID={self.mpv_process.pid}) 但未创建管道")
            return False
        
        # 🔊 MPV 启动成功后，设置默认音量为 50%
        try:
            default_volume = 50
            if hasattr(self, 'config') and self.config:
                vol_str = self.config.get("LOCAL_VOLUME", "50")
                try:
                    default_volume = int(vol_str)
                except (ValueError, TypeError):
                    default_volume = 50
            
            self.mpv_command(["set_property", "volume", default_volume])
            logger.info(f"🔊 MPV 默认音量已设置为: {default_volume}%")
        except Exception as e:
            logger.warning(f"设置默认音量失败: {e}")
        
        return True

    def mpv_command(self, cmd_list) -> bool:
        """向 MPV 发送命令

        写命令，失败时自动尝试启动一次再重试
        """

        def _write():
            # RoomPlayer: loadfile 前等待 PCM 客户端连接（无客户端时 ao=pcm 无背压，会瞬间 EOF）
            if (cmd_list and cmd_list[0] == "loadfile"
                    and hasattr(self, '_pcm_client_connected')):
                if not self._pcm_client_connected.is_set():
                    logger.info("[RoomPlayer] 等待 PCM 客户端连接后再 loadfile...")
                    if not self._pcm_client_connected.wait(timeout=15):
                        logger.error("[RoomPlayer] PCM 客户端连接超时 (15s)，取消 loadfile")
                        raise TimeoutError("PCM client not connected within 15s")
                    logger.info("[RoomPlayer] PCM 客户端已连接，继续 loadfile")

            # Debug: 显示发送的命令
            logger.debug(f"mpv_command -> sending: {cmd_list} to pipe {self.pipe_name}")

            # PipePlayer 模式：额外日志
            if self.mpv_cmd is None:
                logger.info(f"[PipePlayer] 发送命令: {cmd_list[0] if cmd_list else 'N/A'}, 管道: {self.pipe_name}")

            # ✅ 对特定命令显示更详细的日志
            if cmd_list and len(cmd_list) > 0:
                cmd_name = cmd_list[0]
                if cmd_name == "loadfile":
                    file_url = cmd_list[1] if len(cmd_list) > 1 else 'N/A'
                    logger.info(f"📂 [MPV 命令] loadfile: {file_url[:100]}{'...' if len(file_url) > 100 else ''}")
                    
                    # 显示当前 MPV 完整配置信息（包含运行时参数）
                    if self.mpv_cmd and not hasattr(self, '_room_id'):  # PipePlayer/RoomPlayer 跳过此诊断块
                        runtime_audio_device = os.environ.get("MPV_AUDIO_DEVICE", "")
                        mpv_display_cmd = self.mpv_cmd

                        if runtime_audio_device:
                            # 如果有运行时音频设备，显示完整命令
                            import re
                            mpv_display_cmd = re.sub(r'\s*--audio-device=[^\s]+', '', mpv_display_cmd)
                            mpv_display_cmd = mpv_display_cmd.strip() + f" --audio-device={runtime_audio_device}"

                        logger.info(f"   🎵 MPV 完整命令: {mpv_display_cmd}")
                    
                    # 对于网络歌曲（YouTube等），显示额外的参数
                    is_network_url = file_url.startswith(('http://', 'https://'))
                    if is_network_url:
                        logger.info(f"   🌐 网络播放模式")
                        if self.mpv_cmd and not hasattr(self, '_room_id'):
                            logger.info(f"   📋 完整命令参数: {mpv_display_cmd} \"{file_url}\"")
                        # 显示 ytdl 相关属性
                        try:
                            ytdl_format = self.mpv_get("ytdl-format")
                            if ytdl_format:
                                logger.info(f"   🎬 ytdl-format: {ytdl_format}")
                        except:
                            pass
                        
                elif cmd_name == "set_property":
                    if len(cmd_list) >= 3:
                        logger.info(f"⚙️  [MPV 命令] set_property: {cmd_list[1]} = {cmd_list[2]}")
                    else:
                        logger.info(f"⚙️  [MPV 命令] set_property: {cmd_list}")
                elif cmd_name == "cycle":
                    logger.info(f"🔄 [MPV 命令] cycle: {cmd_list[1] if len(cmd_list) > 1 else 'N/A'}")
                elif cmd_name == "stop":
                    logger.info(f"⏹️  [MPV 命令] stop")
                else:
                    logger.debug(f"[MPV 命令] {cmd_name}: {cmd_list[1:] if len(cmd_list) > 1 else 'N/A'}")
            
            with open(self.pipe_name, "wb") as w:
                json_cmd = json.dumps({"command": cmd_list})
                w.write((json_cmd + "\n").encode("utf-8"))
                logger.debug(f"✅ 命令已发送到管道: {self.pipe_name}")
                logger.debug(f"  JSON内容: {json_cmd}")

            # RoomPlayer loadfile 后诊断
            if (cmd_list and cmd_list[0] == "loadfile"
                    and hasattr(self, '_room_id')):
                mpv_alive = (self.mpv_process is not None
                             and self.mpv_process.poll() is None)
                pcm_connected = (hasattr(self, '_pcm_client_connected')
                                 and self._pcm_client_connected.is_set())
                logger.info(f"[RoomPlayer 诊断] loadfile 已发送 → "
                            f"MPV进程存活={mpv_alive}, "
                            f"PCM客户端={pcm_connected}, "
                            f"管道={self.pipe_name}")

        try:
            _write()
            return True
        except TimeoutError as e:
            logger.error(f"❌ 命令发送超时: {e}")
            return False
        except FileNotFoundError as e:
            logger.error(f"❌ 管道不存在: {self.pipe_name}")
            logger.error(f"   详情: {e}")
            logger.warning(f"尝试通过 ensure_mpv() 重新启动 mpv...")
            if self.ensure_mpv():
                try:
                    _write()
                    logger.info(f"✅ 重试后命令发送成功")
                    return True
                except Exception as e2:
                    logger.error(f"❌ 重试写入仍然失败: {e2}")
                    return False
            return False
        except Exception as e:
            import traceback

            logger.error(f"❌ 写入命令失败: {e}")
            logger.debug(f"  异常类型: {type(e).__name__}")
            logger.debug(f"  管道路径: {repr(self.pipe_name)}")
            logger.debug(f"  完整堆栈:")
            traceback.print_exc()
            
            # 检查 mpv 进程状态
            try:
                if os.name == "nt":
                    tl = subprocess.run(
                        ["tasklist", "/FI", "IMAGENAME eq mpv.exe"],
                        capture_output=True,
                        text=True,
                    )
                    if "mpv.exe" in tl.stdout:
                        logger.info(f"✓ mpv.exe 进程存在")
                    else:
                        logger.error(f"✗ mpv.exe 进程不存在，需要重新启动")
            except Exception:
                pass

            logger.warning(f"尝试通过 ensure_mpv() 重新启动 mpv...")
            if self.ensure_mpv():
                try:
                    _write()
                    logger.info(f"✅ 重试后命令发送成功")
                    return True
                except Exception as e2:
                    logger.error(f"❌ 重试写入仍然失败: {e2}")
                    return False
            return False

    def mpv_request(self, payload: dict):
        """向 MPV 发送请求并等待响应"""
        try:
            with open(self.pipe_name, "r+b", 0) as f:
                f.write((json.dumps(payload) + "\n").encode("utf-8"))
                f.flush()
                while True:
                    line = f.readline()
                    if not line:
                        break
                    try:
                        obj = json.loads(line.decode("utf-8", "ignore"))
                    except Exception:
                        continue
                    if obj.get("request_id") == payload.get("request_id"):
                        return obj
        except (OSError, IOError) as e:
            if self.mpv_cmd is not None:
                # 默认 PLAYER 管道错误应引起注意
                logger.warning(f"[mpv_request] 管道错误 (pipe={self.pipe_name}): {e}")
            else:
                # PipePlayer 管道可能尚未就绪，降级为 debug
                logger.debug(f"[mpv_request] PipePlayer 管道错误 (pipe={self.pipe_name}): {e}")
        return None

    def mpv_get(self, prop: str):
        """获取 MPV 属性值"""
        self._req_id += 1
        req = {"command": ["get_property", prop], "request_id": self._req_id}
        resp = self.mpv_request(req)
        if not resp:
            return None
        return resp.get("data")

    def mpv_set(self, prop: str, value) -> bool:
        """设置 MPV 属性值"""
        try:
            self.mpv_command(["set_property", prop, value])
            return True
        except Exception:
            return False

    # ========== 播放控制方法（音量、seek、暂停等） ==========

    def get_volume(self) -> float:
        """获取当前音量（0-130）"""
        vol = self.mpv_get("volume")
        if vol is not None:
            return vol
        return 0.0

    def set_volume(self, volume: float) -> bool:
        """设置音量

        参数:
          volume: 音量值（0-130）

        返回:
          bool: 设置是否成功
        """
        # 限制范围
        if volume < 0:
            volume = 0
        elif volume > 130:
            volume = 130

        return self.mpv_set("volume", volume)

    def seek(self, percent: float) -> bool:
        """跳转到指定播放位置

        参数:
          percent: 播放进度百分比（0-100）

        返回:
          bool: 跳转是否成功
        """
        # 限制范围
        if percent < 0:
            percent = 0
        elif percent > 100:
            percent = 100

        return self.mpv_command(["seek", str(percent), "absolute-percent"])

    def toggle_pause(self) -> bool:
        """切换暂停/播放状态

        返回:
          bool: 操作是否成功
        """
        return self.mpv_command(["cycle", "pause"])

    def toggle_loop_mode(self) -> int:
        """循环播放模式切换: 0=不循环 -> 1=单曲循环 -> 2=全部循环 -> 0

        返回:
          int: 当前循环模式 (0, 1, 或 2)
        """
        self.loop_mode = (self.loop_mode + 1) % 3
        return self.loop_mode

    def set_pitch_shift(self, semitones: int) -> bool:
        """设置音调偏移（KTV升降调），范围 -6 到 +6 个半音。

        使用 MPV rubberband 滤镜实现变调（不改变速度）。
        命名标签 @pitchshift 保证每次 af add 覆盖旧值。

        参数:
            semitones: 半音偏移量（-6 到 +6）
        返回:
            bool: 命令是否发送成功
        """
        semitones = max(-6, min(6, int(semitones)))
        self.pitch_shift = semitones
        if semitones == 0:
            logger.info("[音调] 恢复原调，移除 pitchshift 滤镜")
            return self.mpv_command(["af", "remove", "@pitchshift"])
        else:
            pitch_scale = 2 ** (semitones / 12)
            filter_str = f"@pitchshift:rubberband=pitch-scale={pitch_scale:.6f}"
            logger.info(f"[音调] {semitones:+d} 半音，pitch-scale={pitch_scale:.4f}")
            return self.mpv_command(["af", "add", filter_str])

    def reset_pitch_shift(self) -> bool:
        """重置音调为原调（0 半音），换歌时调用。"""
        return self.set_pitch_shift(0)

    def get_pause_state(self) -> bool:
        """获取暂停状态

        返回:
          bool: True 表示已暂停，False 表示播放中
        """
        paused = self.mpv_get("pause")
        return paused if paused is not None else False

    def stop_playback(self) -> bool:
        """停止播放

        返回:
          bool: 停止是否成功
        """
        return self.mpv_command(["stop"])

    def add_to_playback_history(
        self, url_or_path: str, name: str, is_local: bool = False, thumbnail_url: str = None
    ):
        """添加播放历史"""
        self.playback_history.add_to_history(url_or_path, name, is_local, thumbnail_url)

    def safe_path(self, rel: str) -> str:
        """验证并返回安全的文件路径"""
        base = os.path.abspath(self.music_dir)
        target = os.path.abspath(os.path.join(base, rel))
        if not target.startswith(base):
            raise ValueError("非法路径")
        if not os.path.exists(target):
            raise ValueError("不存在的文件")
        return target

    def gather_tracks(self, root: str) -> list:
        """收集目录下的所有音乐文件"""
        tracks = []
        try:
            for dp, _, files in os.walk(root):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in self.allowed_extensions:
                        tracks.append(os.path.abspath(os.path.join(dp, f)))
        except Exception as e:
            logger.warning(f"遍历目录失败: {e}")
        return tracks

    def build_tree(self) -> dict:
        """构建音乐目录树结构

        返回:
          包含目录和文件信息的嵌套字典
        """
        abs_root = os.path.abspath(self.music_dir)

        def walk(path):
            rel = os.path.relpath(path, abs_root).replace("\\", "/")
            node = {
                "name": os.path.basename(path) or "根目录",
                "rel": "" if rel == "." else rel,
                "dirs": [],
                "files": [],
            }
            try:
                for name in sorted(os.listdir(path), key=str.lower):
                    full = os.path.join(path, name)
                    if os.path.isdir(full):
                        node["dirs"].append(walk(full))
                    else:
                        ext = os.path.splitext(name)[1].lower()
                        if ext in self.allowed_extensions:
                            rp = os.path.relpath(full, abs_root).replace("\\", "/")
                            node["files"].append({"name": name, "rel": rp})
            except Exception:
                pass
            return node

        return walk(abs_root)

    def build_playlist(self) -> list:
        """构建播放列表（所有音乐文件的相对路径列表）

        返回:
          排序后的相对路径列表
        """
        abs_root = os.path.abspath(self.music_dir)
        tracks = []
        for dp, _, files in os.walk(abs_root):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in self.allowed_extensions:
                    rel = os.path.relpath(os.path.join(dp, f), abs_root).replace(
                        "\\", "/")
                    tracks.append(rel)
        tracks.sort(key=str.lower)
        return tracks

    def search_local(self, query: str, max_results: int = 20) -> list:
        """搜索本地音乐库，支持文件名和目录名模糊匹配
        
        参数:
          query: 搜索关键词
          max_results: 最大返回结果数（默认20）
        
        返回:
          匹配的结果列表（歌曲和目录）
          [{"url": "相对路径", "title": "文件/目录名", "type": "local|directory"}, ...]
        """
        if not query or not query.strip():
            return []
        
        query_normalized = _to_simplified(query.strip()).lower()
        results = []
        found_paths = set()  # 追踪已添加的路径（目录+文件），避免重复
        abs_root = os.path.abspath(self.music_dir)
        
        try:
            # 遍历整个音乐目录
            for dp, dirs, files in os.walk(abs_root):
                # ✅ 早期退出：达到max_results后立即返回
                if len(results) >= max_results:
                    return results
                
                # 搜索目录名匹配
                for dirname in dirs:
                    if len(results) >= max_results:
                        return results

                    if query_normalized in _to_simplified(dirname).lower():
                        dir_path = os.path.join(dp, dirname)
                        rel_path = os.path.relpath(dir_path, abs_root).replace("\\", "/")

                        if rel_path not in found_paths:
                            found_paths.add(rel_path)

                            # 展开匹配目录：列出直接子项
                            try:
                                children = sorted(os.listdir(dir_path), key=str.lower)
                            except OSError:
                                continue

                            # 分离子目录和音乐文件
                            child_subdirs = []
                            child_files = []
                            for child in children:
                                child_full = os.path.join(dir_path, child)
                                if os.path.isdir(child_full):
                                    child_subdirs.append(child)
                                else:
                                    ext = os.path.splitext(child)[1].lower()
                                    if ext in self.allowed_extensions:
                                        child_files.append(child)

                            if child_subdirs:
                                # 有子目录：每个子目录作为独立结果
                                for subdir in child_subdirs:
                                    if len(results) >= max_results:
                                        return results
                                    subdir_rel = rel_path + "/" + subdir
                                    if subdir_rel not in found_paths:
                                        found_paths.add(subdir_rel)
                                        results.append({
                                            "url": subdir_rel,
                                            "title": dirname + "/" + subdir,
                                            "type": "directory",
                                            "is_directory": True
                                        })
                            else:
                                # 无子目录：直接展示音乐文件
                                for filename in child_files:
                                    if len(results) >= max_results:
                                        return results
                                    file_rel = rel_path + "/" + filename
                                    if file_rel not in found_paths:
                                        found_paths.add(file_rel)
                                        results.append({
                                            "url": file_rel,
                                            "title": os.path.splitext(filename)[0],
                                            "type": "local",
                                            "is_directory": False
                                        })
                
                # 搜索文件名匹配
                for filename in files:
                    if len(results) >= max_results:
                        return results
                    
                    ext = os.path.splitext(filename)[1].lower()
                    if ext in self.allowed_extensions:
                        # 检查文件名是否包含搜索关键词
                        if query_normalized in _to_simplified(filename).lower():
                            rel_path = os.path.relpath(os.path.join(dp, filename), abs_root).replace("\\", "/")
                            if rel_path not in found_paths:
                                found_paths.add(rel_path)
                                # 移除扩展名作为标题
                                title = os.path.splitext(filename)[0]
                                results.append({
                                    "url": rel_path,
                                    "title": title,
                                    "type": "local",
                                    "is_directory": False
                                })
        except Exception as e:
            logger.error(f"本地搜索失败: {e}")
        
        return results

    def build_local_queue(
        self, folder_path: str = None, clear_existing: bool = True
    ) -> int:
        """从本地文件夹构建播放队列

        参数:
          folder_path: 文件夹路径（相对于music_dir），为None时使用整个music_dir
          clear_existing: 是否清空现有队列

        返回:
          添加到队列的歌曲数量
        """
        if clear_existing:
            self.current_playlist.clear()

        # 确定扫描路径
        if folder_path:
            abs_path = os.path.join(os.path.abspath(self.music_dir), folder_path)
        else:
            abs_path = os.path.abspath(self.music_dir)

        if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
            logger.warning(f"路径不存在或不是文件夹: {abs_path}")
            return 0

        # 收集所有音乐文件
        abs_root = os.path.abspath(self.music_dir)
        tracks = []
        for dp, _, files in os.walk(abs_path):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in self.allowed_extensions:
                    rel = os.path.relpath(os.path.join(dp, f), abs_root).replace(
                        "\\", "/"
                    )
                    tracks.append(rel)

        # 排序
        tracks.sort(key=str.lower)

        # 添加到播放队列
        for rel_path in tracks:
            song = LocalSong(rel_path, os.path.basename(rel_path))
            self.current_playlist.add(song)

        # 如果队列不为空，设置当前索引为第一首
        if not self.current_playlist.is_empty():
            self.current_playlist.set_current_index(0)

        logger.info(f"已从 {folder_path or 'music_dir'} 添加 {len(tracks)} 首歌曲到队列")
        return len(tracks)

    # ========== 播放控制方法 ==========

    def play_index(
        self,
        playlist: list,
        idx: int,
        mpv_command_func,
        mpv_pipe_exists_func,
        ensure_mpv_func,
        save_history: bool = True,
    ):
        """播放播放列表中指定索引的本地文件

        参数:
          playlist: 播放列表（相对路径列表）
          idx: 要播放的索引
          mpv_command_func: mpv 命令执行函数
          mpv_pipe_exists_func: mpv 管道检查函数
          ensure_mpv_func: mpv 确保启动函数
          save_history: 是否保存到播放历史

        返回:
          成功返回 True，失败返回 False
        """
        if idx < 0 or idx >= len(playlist):
            return False

        rel = playlist[idx]
        abs_file = self.safe_path(rel)

        # Debug: print play info
        logger.debug(f"play_index -> idx={idx}, rel={rel}, abs_file={abs_file}")

        try:
            # 确保 mpv 管道存在，否则尝试启动 mpv
            if not mpv_pipe_exists_func():
                logger.warning(f"mpv 管道不存在，尝试启动 mpv...")
                if not ensure_mpv_func():
                    raise RuntimeError("无法启动或连接到 mpv")
            mpv_command_func(["loadfile", abs_file, "replace"])
        except Exception as e:
            logger.error(f"mpv_command failed when playing {abs_file}: {e}")
            raise

        self.current_index = idx
        self.current_meta = {
            "abs_path": abs_file,
            "rel": rel,
            "index": idx,
            "ts": int(time.time()),
            "name": os.path.basename(rel),
        }
        self._last_play_time = time.time()  # 记录播放开始时间

        # 添加到播放历史（存储相对路径，以便 /play 接口使用）
        if save_history:
            self.add_to_playback_history(rel, os.path.basename(rel), is_local=True)

        logger.debug(f"CURRENT_INDEX set to {self.current_index}")
        return True

    def play_url(
        self,
        url: str,
        mpv_command_func,
        mpv_pipe_exists_func,
        ensure_mpv_func,
        mpv_get_func,
        save_to_history: bool = True,
        update_queue: bool = True,
    ):
        """播放网络 URL（如 YouTube）。使用 --ytdl-format=bestaudio 标志让 mpv 正确处理 YouTube。

        参数:
          url: 要播放的 URL
          mpv_command_func: mpv 命令执行函数
          mpv_pipe_exists_func: mpv 管道检查函数
          ensure_mpv_func: mpv 确保启动函数
          mpv_get_func: mpv 属性获取函数
          save_to_history: 是否保存该 URL 到历史记录（仅保存用户直接输入的URL）
          update_queue: 是否更新播放队列（如果False则只播放该URL，保持现有队列）

        返回:
          成功返回 True，失败返回 False
        """
        import subprocess
        import sys

        logger.debug(f"play_url -> url={url}, save_to_history={save_to_history}, update_queue={update_queue}") 
        try:
            # 检查 mpv 进程是否运行
            if not mpv_pipe_exists_func():
                logger.warning(f"mpv pipe 不存在，尝试启动 mpv...")
                if not ensure_mpv_func():
                    raise RuntimeError("无法启动或连接到 mpv")

            # 注意：通过 IPC 发送选项标志（如 --ytdl-format）需要特殊处理。
            # 更好的方法是先设置 ytdl-format 属性，再加载文件。
            logger.debug(f"设置 mpv 属性: ytdl-format=bestaudio")
            mpv_command_func(["set_property", "ytdl-format", "bestaudio"])
            
            # 对于 YouTube URL，优先使用 yt-dlp 获取直链来确保播放成功
            actual_url = url
            if "youtube.com" in url or "youtu.be" in url:
                logger.info(f"🎬 检测到 YouTube URL，尝试通过 yt-dlp 获取直链...")
                yt_dlp_exe = MusicPlayer._get_yt_dlp_path()
                
                try:
                    # 使用 -f bestaudio 确保只获取音频流
                    cmd = [yt_dlp_exe, "-f", "bestaudio", "-g", url]
                    logger.info(f"   ⏳ 运行命令: {' '.join(cmd[:3])} {url[:50]}...")
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    if result.returncode == 0:
                        direct_urls = result.stdout.strip().split("\n")
                        if direct_urls and direct_urls[0]:
                            # 使用第一个 URL（bestaudio 模式下只返回一个音频流）
                            actual_url = direct_urls[0].strip()
                            logger.info(f"   ✅ 获取到音频直链（前100字符）: {actual_url[:100]}...")
                    else:
                        logger.warning(f"   ⚠️  yt-dlp -g 失败 (code={result.returncode}): {result.stderr[:200]}")
                except Exception as e:
                    logger.warning(f"   ⚠️  yt-dlp 获取直链异常: {e}，使用原始 URL")
            
            logger.info(f"📤 调用 mpv loadfile 播放网络歌曲...")
            mpv_command_func(["loadfile", actual_url, "replace"])
            logger.debug(f"已向 mpv 发送播放命令")

            # 保存当前本地播放状态，以便网络流结束后恢复
            self._prev_index = self.current_index
            self._prev_meta = dict(self.current_meta) if self.current_meta else None

            # 初始化 CURRENT_META：保留 raw_url，并使用占位名（避免将原始 URL 直接显示给用户）
            # 同时准备 media_title 字段供客户端优先显示
            self.current_meta = {
                "abs_path": url,
                "rel": url,
                "index": -1,
                "ts": int(time.time()),
                "name": "加载中…",
                "raw_url": url,
                "media_title": None,
            }

            # 检测是否为播放列表 URL
            is_playlist = False
            playlist_entries = []
            if (
                "youtube.com/playlist" in url
                or "youtu.be" in url
                or "youtube.com/watch" in url
            ):
                try:
                    # 使用 yt-dlp 获取播放列表信息
                    logger.debug(f"尝试使用 yt-dlp 提取播放列表信息...")
                    yt_dlp_exe = MusicPlayer._get_yt_dlp_path()
                    cmd = [yt_dlp_exe, "--flat-playlist", "-j", url]
                    result = subprocess.run(
                        cmd, capture_output=True, text=True, timeout=30
                    )
                    if result.returncode == 0:
                        lines = result.stdout.strip().split("\n")
                        for line in lines:
                            if line.strip():
                                try:
                                    entry = json.loads(line)
                                    if isinstance(entry, dict):
                                        entry_url = entry.get("url") or entry.get("id")
                                        entry_title = entry.get("title", "未知")
                                        # 构建完整 YouTube URL
                                        if entry_url and not entry_url.startswith(
                                            "http"
                                        ):
                                            if len(entry_url) == 11:  # 可能是视频 ID
                                                entry_url = f"https://www.youtube.com/watch?v={entry_url}"
                                        playlist_entries.append(
                                            {
                                                "url": entry_url,
                                                "title": entry_title,
                                                "ts": int(time.time()),
                                            }
                                        )
                                except json.JSONDecodeError:
                                    pass
                        if playlist_entries:
                            is_playlist = True
                            logger.debug(f"检测到播放列表，共 {len(playlist_entries)} 项") 
                except Exception as e:
                    logger.warning(f"提取播放列表失败: {e}")
                    is_playlist = False
                    playlist_entries = []

            # 添加到播放历史
            if is_playlist:
                # 如果是播放列表，仅在save_to_history为True时添加原始URL（播放列表URL）
                if save_to_history:
                    playlist_name = f"播放列表 ({len(playlist_entries)} 首)"
                    self.add_to_playback_history(url, playlist_name, is_local=False)
                else:
                    logger.debug(f"跳过添加播放列表到历史记录 (save_to_history=False)")
                # 设置当前播放队列（仅当update_queue为True时）
                if update_queue:
                    # 清空现有队列并添加播放列表项
                    self.current_playlist.clear()
                    for entry in playlist_entries:
                        song = StreamSong(entry["url"], entry["title"])
                        self.current_playlist.add(song)
                    self.current_playlist.set_current_index(0)
                    logger.debug(f"已将播放列表添加到队列，共 {len(playlist_entries)} 项") 
            else:
                # 单个视频的添加逻辑
                if save_to_history:
                    self.add_to_playback_history(url, "加载中…", is_local=False)
                else:
                    logger.debug(f"跳过添加单个视频到历史记录 (save_to_history=False)")
                # 单个视频的队列（仅当update_queue为True时）
                if update_queue:
                    # 允许重复添加相同的URL，不进行去重检查
                    self.current_playlist.clear()
                    song = StreamSong(url, "加载中…")
                    self.current_playlist.add(song)
                    self.current_playlist.set_current_index(0)
                    logger.debug(f"创建新播放队列（单个视频）")

            # 后台线程轮询获取 mpv 的 media-title（避免阻塞调用方最多 10 秒）
            def _poll_media_title():
                for attempt in range(20):
                    time.sleep(0.5)
                    try:
                        media_title = mpv_get_func("media-title")
                        if (
                            media_title
                            and isinstance(media_title, str)
                            and not MusicPlayer._is_invalid_title(media_title, url)
                        ):
                            # 将获得的媒体标题写入 media_title 字段，并同步更新用户可见的 name
                            self.current_meta["media_title"] = media_title
                            self.current_meta["name"] = media_title
                            # 更新历史记录中最新项的标题（仅当save_to_history为True时）
                            if save_to_history and not self.playback_history.is_empty():
                                history_items = self.playback_history.get_all()
                                if history_items and history_items[0]["url"] == url:
                                    self.playback_history.update_item(0, name=media_title)
                            logger.debug(f"mpv media-title 探测到 (尝试 {attempt+1}): {media_title}")
                            break
                        else:
                            if attempt < 4:
                                logger.debug(f"media-title 未就绪或不符合 (尝试 {attempt+1}), 值: {repr(media_title)}")
                    except Exception as _e:
                        if attempt == 19:
                            logger.warning(f"无法读取 mpv media-title (最终失败): {_e}")

            import threading
            threading.Thread(
                target=_poll_media_title, daemon=True, name="play_url-title-poll"
            ).start()

            # 记录播放开始时间
            self._last_play_time = time.time()
            logger.debug(f"已设置为播放 URL: {url}，启动时间戳: {self._last_play_time}") 
            return True
        except Exception as e:
            logger.error(f"play_url failed for {url}: {e}")
            import traceback

            traceback.print_exc()
            raise

    def next_track(
        self,
        playlist: list,
        mpv_command_func,
        mpv_pipe_exists_func,
        ensure_mpv_func,
        save_history: bool = True,
    ):
        """播放播放列表中的下一首歌曲

        参数:
          playlist: 播放列表（相对路径列表）
          mpv_command_func: mpv 命令执行函数
          mpv_pipe_exists_func: mpv 管道检查函数
          ensure_mpv_func: mpv 确保启动函数
          save_history: 是否保存到播放历史

        返回:
          成功返回 True，失败返回 False
        """
        if self.current_index < 0:
            return False

        nxt = self.current_index + 1
        if nxt >= len(playlist):
            return False

        return self.play_index(
            playlist=playlist,
            idx=nxt,
            mpv_command_func=mpv_command_func,
            mpv_pipe_exists_func=mpv_pipe_exists_func,
            ensure_mpv_func=ensure_mpv_func,
            save_history=save_history,
        )

    def previous_track(
        self,
        playlist: list,
        mpv_command_func,
        mpv_pipe_exists_func,
        ensure_mpv_func,
        save_history: bool = True,
    ):
        """播放播放列表中的上一首歌曲

        参数:
          playlist: 播放列表（相对路径列表）
          mpv_command_func: mpv 命令执行函数
          mpv_pipe_exists_func: mpv 管道检查函数
          ensure_mpv_func: mpv 确保启动函数
          save_history: 是否保存到播放历史

        返回:
          成功返回 True，失败返回 False
        """
        if self.current_index < 0:
            return False

        prv = self.current_index - 1
        if prv < 0:
            return False

        return self.play_index(
            playlist=playlist,
            idx=prv,
            mpv_command_func=mpv_command_func,
            mpv_pipe_exists_func=mpv_pipe_exists_func,
            ensure_mpv_func=ensure_mpv_func,
            save_history=save_history,
        )

    def play(
        self,
        song,
        mpv_command_func,
        mpv_pipe_exists_func,
        ensure_mpv_func,
        add_to_history_func=None,
        save_to_history: bool = True,
        mpv_cmd: str = None,
    ):
        """统一的播放接口，根据歌曲对象类型调用相应的播放方法

        参数:
          song: Song 对象（LocalSong 或 StreamSong）
          mpv_command_func: mpv 命令执行函数
          mpv_pipe_exists_func: 检查 mpv 管道是否存在的函数
          ensure_mpv_func: 确保 mpv 运行的函数
          add_to_history_func: 添加到历史记录的函数（可选）
          save_to_history: 是否保存到播放历史
          mpv_cmd: 实际使用的mpv启动命令（来自配置文件）

        返回:
          成功返回 True，失败返回 False
        """
        if not song:
            logger.error(f"play() called with None song")
            return False

        # 🔍 详细调试日志 - 网络歌曲播放追踪
        is_stream = song.is_stream() if hasattr(song, 'is_stream') else False
        logger.info("=" * 60)
        logger.info(f"🎵 [MusicPlayer.play] 开始播放")
        logger.info(f"   📌 歌曲对象: {type(song).__name__}")
        logger.info(f"   📌 URL: {getattr(song, 'url', 'N/A')}")
        logger.info(f"   📌 标题: {getattr(song, 'title', 'N/A')}")
        logger.info(f"   📌 是否串流: {'✅ 是' if is_stream else '❌ 否'}")
        logger.info("=" * 60)

        try:
            # 根据歌曲类型调用相应的播放方法
            logger.info(f"[MusicPlayer.play] 调用 song.play()...")
            success = song.play(
                mpv_command_func=mpv_command_func,
                mpv_pipe_exists_func=mpv_pipe_exists_func,
                ensure_mpv_func=ensure_mpv_func,
                add_to_history_func=add_to_history_func,
                save_to_history=save_to_history,
                music_dir=self.music_dir,
            )

            if not success:
                logger.error(f"[MusicPlayer.play] ❌ song.play() 返回失败")
                return False
            
            logger.info(f"[MusicPlayer.play] ✅ song.play() 返回成功")

            # 更新当前播放的元数据
            self.current_meta = song.to_dict()
            self._last_play_time = time.time()
            logger.info(f"[MusicPlayer.play] 已更新 current_meta: duration={self.current_meta.get('duration', 'N/A')}")
            logger.debug(f"已更新 current_meta: {self.current_meta}")

            # RoomPlayer 播放后诊断
            if hasattr(self, '_room_id'):
                mpv_alive = (self.mpv_process is not None
                             and self.mpv_process.poll() is None)
                pcm_ok = (hasattr(self, '_pcm_client_connected')
                          and self._pcm_client_connected.is_set())
                relay_alive = (hasattr(self, '_relay_thread')
                               and self._relay_thread is not None
                               and self._relay_thread.is_alive())
                logger.info(f"[RoomPlayer 诊断] play 完成 → "
                            f"MPV存活={mpv_alive}, "
                            f"PCM客户端={pcm_ok}, "
                            f"drain线程={relay_alive}")

            # 对于串流媒体，尝试获取真实的媒体标题
            if song.is_stream():
                import threading

                def _fetch_media_title():
                    """后台线程：获取串流媒体的真实标题"""

                    url = song.url
                    for attempt in range(20):
                        time.sleep(0.5)
                        try:
                            media_title = self.mpv_get("media-title")
                            if (
                                media_title
                                and isinstance(media_title, str)
                                and not MusicPlayer._is_invalid_title(media_title, url)
                            ):
                                # 更新当前元数据
                                self.current_meta["media_title"] = media_title
                                self.current_meta["name"] = media_title
                                # 更新历史记录中的标题
                                if (
                                    save_to_history
                                    and not self.playback_history.is_empty()
                                ):
                                    history_items = self.playback_history.get_all()
                                    if history_items and history_items[0]["url"] == url:
                                        self.playback_history.update_item(
                                            0, name=media_title
                                        )
                                logger.debug(f"获取到串流媒体标题 (尝试 {attempt+1}): {media_title}") 
                                break
                            else:
                                if attempt < 4:
                                    logger.debug(f"媒体标题未就绪 (尝试 {attempt+1}), 值: {repr(media_title)}") 
                        except Exception as e:
                            if attempt == 19:
                                logger.warning(f"无法获取媒体标题: {e}")

                # 启动后台线程获取标题
                threading.Thread(
                    target=_fetch_media_title, daemon=True, name="FetchMediaTitle"
                ).start()

            # 播放成功后，后台预获取下一曲直链（仅 YouTube 歌曲受益）
            self._prefetch_next_song_url()

            return True
        except Exception as e:
            logger.error(f"play() failed: {e}")
            import traceback

            traceback.print_exc()
            return False

    def _prefetch_next_song_url(self):
        """后台守护线程：预获取播放列表中下一曲的 YouTube 直链并写入缓存。
        在当前曲开始播放后立即触发，使下次切歌能直接命中缓存。
        幂等：由 url_cache.prefetch() 内部保证不重复提交同一 video_id。
        """
        def _do():
            try:
                playlists_mgr = self._ext_playlists_manager
                default_pid = self._ext_default_playlist_id
                if playlists_mgr is None or default_pid is None:
                    return
                playlist = playlists_mgr.get_playlist(default_pid)
                if not playlist or not playlist.songs:
                    return

                songs = playlist.songs
                # 下一首：当前 index+1，超出则回到 0（循环头部）
                current_idx = self.current_index if self.current_index >= 0 else 0
                next_idx = current_idx + 1
                if next_idx >= len(songs):
                    next_idx = 0
                if next_idx >= len(songs):
                    return

                next_song = songs[next_idx]
                if isinstance(next_song, dict):
                    url = next_song.get("url", "")
                    song_type = next_song.get("type", "local")
                else:
                    url = str(next_song)
                    song_type = "local"

                # 只对 YouTube 歌曲预获取
                if not url or (song_type == "local" and not url.startswith("http")):
                    return

                from models.song import StreamSong
                from models.url_cache import url_cache

                tmp = StreamSong(stream_url=url, title="prefetch")
                if not tmp.video_id:
                    return

                # 确定 yt-dlp 路径
                yt_dlp_exe = MusicPlayer._get_yt_dlp_path()

                logger.info(f"[预获取] 当前曲已开始，预获取下一曲: {url[:60]}")
                url_cache.prefetch(tmp.video_id, url, yt_dlp_exe)

            except Exception as e:
                logger.debug(f"[预获取] 异常（无害）: {e}")

        import threading
        threading.Thread(target=_do, daemon=True, name="PrefetchNextURL").start()

    def handle_track_end(
        self,
        mpv_command_func=None,
        mpv_pipe_exists_func=None,
        ensure_mpv_func=None,
        add_to_history_func=None,
    ) -> bool:
        """根据循环模式处理曲目结束后的自动播放逻辑

        返回 True 表示已启动下一首或重新播放当前首，False 表示无需自动播放。
        """
        mpv_command_func = mpv_command_func or self.mpv_command
        mpv_pipe_exists_func = mpv_pipe_exists_func or self.mpv_pipe_exists
        ensure_mpv_func = ensure_mpv_func or self.ensure_mpv
        add_to_history_func = add_to_history_func or self.add_to_playback_history

        if self.current_playlist.is_empty():
            logger.info("handle_track_end: 播放队列为空，停止自动播放")
            return False

        current_idx = self.current_playlist.get_current_index()
        playlist_size = self.current_playlist.size()

        def _play_at(index: int) -> bool:
            if not (0 <= index < queue_size):
                logger.warning(f"handle_track_end: 无效的索引 {index}，队列大小 {queue_size}")
                return False
            return self.current_playlist.play_at_index(
                index=index,
                save_to_history=True,
                mpv_command_func=mpv_command_func,
                mpv_pipe_exists_func=mpv_pipe_exists_func,
                ensure_mpv_func=ensure_mpv_func,
                add_to_history_func=add_to_history_func,
                music_dir=self.music_dir,
            )

        action_desc = "none"
        success = False

        if self.loop_mode == 1:
            # 单曲循环：重新播放当前索引（若无效则回到0）
            target_idx = current_idx if 0 <= current_idx < queue_size else 0
            action_desc = f"单曲循环 -> 重新播放索引 {target_idx}"
            success = _play_at(target_idx)
        elif self.loop_mode == 2:
            # 全部循环：先尝试下一首，末尾则回到第一首
            if self.current_playlist.has_next():
                action_desc = "全部循环 -> 下一首"
                success = self.current_playlist.play_next(
                    save_to_history=True,
                    mpv_command_func=mpv_command_func,
                    mpv_pipe_exists_func=mpv_pipe_exists_func,
                    ensure_mpv_func=ensure_mpv_func,
                    add_to_history_func=add_to_history_func,
                    music_dir=self.music_dir,
                )
            elif queue_size > 0:
                action_desc = "全部循环 -> 回到第一首"
                success = _play_at(0)
        else:
            # 顺序播放（loop_mode=0）：仅在有下一首时继续
            if self.current_playlist.has_next():
                action_desc = "顺序播放 -> 下一首"
                success = self.current_playlist.play_next(
                    save_to_history=True,
                    mpv_command_func=mpv_command_func,
                    mpv_pipe_exists_func=mpv_pipe_exists_func,
                    ensure_mpv_func=ensure_mpv_func,
                    add_to_history_func=add_to_history_func,
                    music_dir=self.music_dir,
                )
            else:
                action_desc = "顺序播放 -> 末尾已停止"
                success = False

        logger.info(f"handle_track_end: {action_desc}, success={success}, current_idx={current_idx}, queue_size={queue_size}")

        if success:
            # 成功启动后更新时间戳并持久化队列
            self._last_play_time = time.time()
            try:
                self.save_current_playlist()
            except Exception as e:
                logger.warning(f"保存播放列表失败: {e}")
        return success

    def to_dict(self) -> dict:
        """转换为字典（用于序列化保存配置）"""
        return {
            "MUSIC_DIR": self.music_dir,
            "ALLOWED_EXTENSIONS": ",".join(sorted(self.allowed_extensions)),
            "SERVER_HOST": self.server_host,
            "SERVER_PORT": str(self.server_port),
            "DEBUG": "true" if self.debug else "false",
            "MPV_CMD": self.mpv_cmd or "",
        }

    def __repr__(self):
        return (
            f"MusicPlayer(music_dir='{self.music_dir}', "
            f"queue_size={self.current_playlist.size()}, "
            f"history_size={len(self.playback_history)})"
        )
