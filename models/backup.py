"""
定时备份模块 - 按配置间隔备份指定 JSON 数据文件，并自动清理过期备份。

配置项（settings.ini [backup] 节）：
  enabled        = true          # 是否启用
  backup_dir     = backups       # 备份目录（相对于应用根目录或绝对路径）
  interval_hours = 6             # 备份间隔（小时，支持小数）
  keep_days      = 7             # 备份保留天数
"""

import os
import shutil
import time
import threading
import configparser
import logging
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

_SETTINGS_FILE = "settings.ini"


class BackupManager:
    """定时备份指定文件到 backup_dir，按天保留旧备份。"""

    def __init__(self):
        cfg = self._read_config()
        self.enabled       = cfg["enabled"]
        self.backup_dir    = Path(cfg["backup_dir"])
        self.interval_secs = cfg["interval_hours"] * 3600
        self.keep_days     = cfg["keep_days"]
        self.source_files  = ["playlists.json", "playback_history.json"]

    # ------------------------------------------------------------------
    # 配置读取
    # ------------------------------------------------------------------

    def _read_config(self) -> dict:
        config = configparser.ConfigParser()
        if os.path.exists(_SETTINGS_FILE):
            config.read(_SETTINGS_FILE, encoding="utf-8")
        return {
            "enabled":        config.getboolean("backup", "enabled",         fallback=True),
            "backup_dir":     config.get(       "backup", "backup_dir",      fallback="backups"),
            "interval_hours": config.getfloat(  "backup", "interval_hours",  fallback=6.0),
            "keep_days":      config.getint(    "backup", "keep_days",       fallback=7),
        }

    # ------------------------------------------------------------------
    # 核心操作
    # ------------------------------------------------------------------

    def _do_backup(self):
        """将所有源文件以时间戳副本写入 backup_dir。"""
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        for src in self.source_files:
            src_path = Path(src)
            if not src_path.exists():
                logger.debug(f"[Backup] 跳过不存在的文件: {src}")
                continue
            dest = self.backup_dir / f"{src_path.stem}_{ts}{src_path.suffix}"
            tmp  = dest.with_suffix(".tmp")
            shutil.copy2(src_path, tmp)
            tmp.replace(dest)   # Path.replace() 在 Windows 上原子覆盖目标文件
            logger.info(f"[Backup] {src_path.name} -> {dest.name}")

    def _do_cleanup(self):
        """删除超过 keep_days 天的旧备份文件。"""
        if not self.backup_dir.exists():
            return
        cutoff = (datetime.now() - timedelta(days=self.keep_days)).timestamp()
        for f in self.backup_dir.iterdir():
            if f.is_file() and f.stat().st_mtime < cutoff:
                try:
                    f.unlink()
                    logger.info(f"[Backup] 已删除过期备份: {f.name}")
                except OSError as e:
                    logger.warning(f"[Backup] 删除过期备份失败 {f.name}: {e}")

    # ------------------------------------------------------------------
    # 后台线程
    # ------------------------------------------------------------------

    def _run(self):
        logger.info(
            f"[Backup] 线程启动 — 间隔={self.interval_secs / 3600:.2f}h  "
            f"保留={self.keep_days}天  目录={self.backup_dir.resolve()}"
        )
        while True:
            time.sleep(self.interval_secs)   # 先等待完整间隔，启动时不立即备份
            try:
                self._do_backup()
                self._do_cleanup()
            except Exception as e:
                logger.error(f"[Backup] 备份异常: {e}", exc_info=True)

    def start(self):
        """启动后台 daemon 备份线程。"""
        if not self.enabled:
            logger.info("[Backup] 备份功能已禁用（settings.ini: backup.enabled = false）")
            return
        t = threading.Thread(target=self._run, daemon=True, name="BackupThread")
        t.start()


# 全局单例 — 供 app.py 直接引用
backup_manager = BackupManager()
