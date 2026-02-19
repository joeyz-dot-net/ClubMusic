"""
YouTube 直链 URL 缓存管理器

- 线程安全的内存缓存
- TTL 18000 秒（5小时），YouTube 直链约 6 小时过期
- 支持后台预获取，幂等（同一 video_id 不重复提交）
- 并行获取音频 + 视频直链
- 可通过 settings.ini [cache] url_cache_enabled 开关
"""
import threading
import time
import subprocess
import logging
import concurrent.futures
import configparser
import os
from typing import Optional

logger = logging.getLogger(__name__)

URL_CACHE_TTL = 18000  # 5 小时
_SETTINGS_FILE = "settings.ini"


def _run_ytdlp(yt_dlp_exe: str, args: list) -> list:
    """执行 yt-dlp，返回输出的 URL 列表。失败或异常时返回空列表。"""
    try:
        cmd = [yt_dlp_exe] + args
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return [u.strip() for u in result.stdout.strip().split("\n") if u.strip()]
    except subprocess.TimeoutExpired:
        logger.warning(f"[URLCache] yt-dlp 超时: {args[-1][:60]}")
    except Exception as e:
        logger.warning(f"[URLCache] yt-dlp 异常: {e}")
    return []


def _read_enabled_from_file() -> bool:
    """从 settings.ini 读取 [cache] url_cache_enabled，默认 True。"""
    try:
        if not os.path.exists(_SETTINGS_FILE):
            return True
        config = configparser.ConfigParser()
        config.read(_SETTINGS_FILE, encoding="utf-8")
        return config.getboolean("cache", "url_cache_enabled", fallback=True)
    except Exception as e:
        logger.warning(f"[URLCache] 读取配置失败，使用默认值 True: {e}")
        return True


class URLCache:
    """线程安全的 YouTube 直链内存缓存"""

    def __init__(self, ttl: int = URL_CACHE_TTL):
        self._ttl = ttl
        # { video_id: {"audio_url": str, "video_url": str|None, "expires_at": float} }
        self._cache: dict = {}
        self._lock = threading.RLock()
        # 正在预获取的 video_id 集合，防止重复提交
        self._prefetching: set = set()
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="URLCachePrefetch"
        )
        # 从配置文件加载开关状态
        self.enabled: bool = _read_enabled_from_file()
        logger.info(f"[URLCache] 初始化完成，缓存{'已启用' if self.enabled else '已禁用'}")

    def reload_config(self):
        """从 settings.ini 重新加载配置（在配置文件被修改后调用）。"""
        new_enabled = _read_enabled_from_file()
        if new_enabled != self.enabled:
            self.enabled = new_enabled
            logger.info(f"[URLCache] 配置已重载，缓存{'已启用' if self.enabled else '已禁用'}")
            if not self.enabled:
                self.clear()
        else:
            logger.debug(f"[URLCache] 配置重载，无变化（enabled={self.enabled}）")

    def clear(self):
        """清空所有缓存条目。"""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
        logger.info(f"[URLCache] 已清空缓存（{count} 条）")

    def get(self, video_id: str) -> Optional[dict]:
        """查找缓存。缓存禁用或未命中或已过期时返回 None。"""
        if not self.enabled:
            return None
        if not video_id:
            return None
        with self._lock:
            entry = self._cache.get(video_id)
            if entry:
                if time.time() < entry["expires_at"]:
                    remaining = entry["expires_at"] - time.time()
                    logger.info(f"[URLCache] 缓存命中: {video_id}，剩余 {remaining:.0f}s")
                    return entry
                else:
                    del self._cache[video_id]
                    logger.debug(f"[URLCache] 缓存已过期: {video_id}")
            return None

    def set(self, video_id: str, audio_url: str, video_url: Optional[str] = None):
        """写入缓存。缓存禁用时为空操作。"""
        if not self.enabled:
            return
        if not video_id or not audio_url:
            return
        with self._lock:
            self._cache[video_id] = {
                "audio_url": audio_url,
                "video_url": video_url,
                "expires_at": time.time() + self._ttl,
            }
        logger.info(
            f"[URLCache] 已缓存 {video_id}: "
            f"audio={audio_url[:60]}..., "
            f"video={'有' if video_url else '无'}"
        )

    def invalidate(self, video_id: str):
        """主动使某条记录失效（如播放失败时调用）。"""
        if not video_id:
            return
        with self._lock:
            if video_id in self._cache:
                del self._cache[video_id]
                logger.info(f"[URLCache] 已失效缓存: {video_id}")

    def prefetch(self, video_id: str, youtube_url: str, yt_dlp_exe: str):
        """
        后台异步预获取直链并写入缓存。
        缓存禁用时直接返回。
        幂等：同一 video_id 在进行中时不重复提交。
        缓存有效且距过期超过 5 分钟时跳过。
        """
        if not self.enabled:
            return
        if not video_id or not youtube_url:
            return
        with self._lock:
            if video_id in self._prefetching:
                logger.debug(f"[URLCache] 预获取进行中，跳过: {video_id}")
                return
            entry = self._cache.get(video_id)
            if entry and time.time() < entry["expires_at"] - 300:
                logger.debug(f"[URLCache] 缓存有效，无需预获取: {video_id}")
                return
            self._prefetching.add(video_id)

        logger.info(f"[URLCache] 开始后台预获取: {video_id} ({youtube_url[:60]})")
        future = self._executor.submit(
            self._fetch_both, video_id, youtube_url, yt_dlp_exe
        )
        future.add_done_callback(lambda f: self._on_done(video_id, f))

    def _fetch_both(self, video_id: str, youtube_url: str, yt_dlp_exe: str) -> dict:
        """并行获取音频和视频直链（在线程池中执行）。"""
        result = {"audio_url": None, "video_url": None}
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as inner:
                audio_fut = inner.submit(
                    _run_ytdlp, yt_dlp_exe, ["-f", "bestaudio", "-g", youtube_url]
                )
                video_fut = inner.submit(
                    _run_ytdlp, yt_dlp_exe,
                    ["-f", "bestvideo[height<=720][ext=mp4]", "-g", youtube_url]
                )
                try:
                    audio_urls = audio_fut.result(timeout=35)
                    if audio_urls:
                        result["audio_url"] = audio_urls[0]
                except Exception as e:
                    logger.warning(f"[URLCache] 音频直链获取失败: {e}")
                try:
                    video_urls = video_fut.result(timeout=35)
                    if video_urls:
                        result["video_url"] = video_urls[0]
                except Exception as e:
                    logger.warning(f"[URLCache] 视频直链获取失败: {e}")
        except Exception as e:
            logger.error(f"[URLCache] _fetch_both 异常: {e}")
        return result

    def _on_done(self, video_id: str, future: concurrent.futures.Future):
        """预获取完成回调。"""
        with self._lock:
            self._prefetching.discard(video_id)
        try:
            data = future.result()
            if data.get("audio_url"):
                self.set(video_id, data["audio_url"], data.get("video_url"))
                logger.info(f"[URLCache] 预获取成功并已缓存: {video_id}")
            else:
                logger.warning(f"[URLCache] 预获取完成但无有效音频 URL: {video_id}")
        except Exception as e:
            logger.error(f"[URLCache] 预获取回调异常: {e}")


# 全局单例，供 song.py、player.py、app.py 引用
url_cache = URLCache()
