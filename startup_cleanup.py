import os
import sys
import time

import psutil


_STARTUP_CLEANUP_ENV = "CLUBMUSIC_STARTUP_CLEANUP_DONE"


def _log(logger, level: str, message: str):
    if logger is not None:
        log_method = getattr(logger, level, None)
        if callable(log_method):
            log_method(message)


def _get_app_dir() -> str:
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _is_clubmusic_mpv_process(proc: psutil.Process, app_dir: str) -> bool:
    try:
        name = (proc.info.get("name") or "").lower()
        if name not in {"mpv.exe", "mpv"}:
            return False

        exe_path = (proc.info.get("exe") or "").strip('"').lower()
        cmdline = proc.info.get("cmdline") or []
        cmdline_text = " ".join(str(part) for part in cmdline).lower()

        managed_pipes = (
            "--input-ipc-server=\\\\.\\pipe\\mpv-pipe",
            "--input-ipc-server=\\\\.\\pipe\\mpv-ipc-",
        )
        if any(pipe in cmdline_text for pipe in managed_pipes):
            return True

        expected_exe = os.path.join(app_dir, "bin", "mpv.exe").lower()
        return bool(exe_path and exe_path == expected_exe)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False


def cleanup_stale_mpv_processes(logger=None, force: bool = False) -> list[int]:
    """清理 ClubMusic 上次残留的 MPV 进程。"""
    if not force and os.environ.get(_STARTUP_CLEANUP_ENV) == "1":
        return []

    os.environ[_STARTUP_CLEANUP_ENV] = "1"

    app_dir = _get_app_dir()
    killed_pids: list[int] = []

    for proc in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
        if not _is_clubmusic_mpv_process(proc, app_dir):
            continue

        pid = proc.info.get("pid")
        if pid == os.getpid():
            continue

        try:
            _log(logger, "warning", f"[Startup] 发现残留 MPV 进程，准备清理: PID={pid}")
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except psutil.TimeoutExpired:
                _log(logger, "warning", f"[Startup] MPV 进程未及时退出，强制终止: PID={pid}")
                proc.kill()
                proc.wait(timeout=2)

            killed_pids.append(pid)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except (psutil.AccessDenied, psutil.TimeoutExpired) as e:
            _log(logger, "warning", f"[Startup] 清理残留 MPV 进程失败: PID={pid}, error={e}")

    if killed_pids:
        time.sleep(0.3)
        _log(logger, "info", f"[Startup] 已清理残留 MPV 进程: {', '.join(str(pid) for pid in killed_pids)}")
    else:
        _log(logger, "info", "[Startup] 未发现残留 MPV 进程")

    return killed_pids