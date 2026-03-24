import atexit
import datetime
import json
import os
import socket
import sys
import tempfile
import time
from hashlib import sha1

import psutil


_STARTUP_CLEANUP_ENV = "CLUBMUSIC_STARTUP_CLEANUP_DONE"
_INSTANCE_LOCK_ENV = "CLUBMUSIC_INSTANCE_LOCK_ACQUIRED"
_ACTIVE_INSTANCE_LOCK_PATH = None


def _log(logger, level: str, message: str):
    if logger is not None:
        log_method = getattr(logger, level, None)
        if callable(log_method):
            log_method(message)


def _get_app_dir() -> str:
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _get_instance_lock_path(app_dir: str | None = None) -> str:
    app_dir = app_dir or _get_app_dir()
    app_hash = sha1(os.path.abspath(app_dir).encode("utf-8")).hexdigest()[:12]
    return os.path.join(tempfile.gettempdir(), f"clubmusic-instance-{app_hash}.lock")


def _normalize_host_for_probe(host: str) -> str:
    normalized = (host or "").strip()
    if normalized in {"", "0.0.0.0", "::", "*"}:
        return "127.0.0.1"
    return normalized


def _is_port_accepting_connections(host: str, port: int, timeout: float = 0.5) -> bool:
    probe_host = _normalize_host_for_probe(host)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        return sock.connect_ex((probe_host, int(port))) == 0
    except OSError:
        return False
    finally:
        sock.close()


def _read_instance_lock(lock_path: str) -> dict | None:
    try:
        with open(lock_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _write_instance_lock(lock_path: str, payload: dict):
    with open(lock_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _format_timestamp(timestamp) -> str:
    try:
        return datetime.datetime.fromtimestamp(float(timestamp)).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError, OSError, OverflowError):
        return "unknown"


def _build_instance_summary(host: str, port: int, pid: int, lock_path: str, lock_data: dict | None = None) -> str:
    info = lock_data or {}
    lock_host = info.get("host") or host
    lock_port = info.get("port") or port
    started_at_text = _format_timestamp(info.get("started_at"))
    access_url = f"http://{_normalize_host_for_probe(str(lock_host))}:{int(lock_port)}/"
    return (
        f"PID={pid}\n"
        f"访问地址: {access_url}\n"
        f"启动时间: {started_at_text}\n"
        f"锁文件: {lock_path}"
    )


def _remove_instance_lock(lock_path: str | None = None):
    target_path = lock_path or _ACTIVE_INSTANCE_LOCK_PATH
    if not target_path:
        return

    try:
        os.remove(target_path)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _looks_like_clubmusic_process(proc: psutil.Process, app_dir: str) -> bool:
    try:
        exe_path = (proc.info.get("exe") or "").strip('"').lower()
        cmdline = proc.info.get("cmdline") or []
        cmdline_text = " ".join(str(part) for part in cmdline).lower()
        normalized_app_dir = os.path.abspath(app_dir).lower()
        executable_name = os.path.basename(sys.executable if getattr(sys, 'frozen', False) else "ClubMusic.exe").lower()
        entrypoint_names = {"run.py", "main.py", "app.py", "clubmusic.exe"}

        if normalized_app_dir and normalized_app_dir in exe_path:
            return True
        if normalized_app_dir and normalized_app_dir in cmdline_text:
            return True
        if executable_name and executable_name in exe_path:
            return True

        for part in cmdline:
            part_text = str(part).strip().strip('"')
            if not part_text:
                continue

            basename = os.path.basename(part_text).lower()
            if basename in entrypoint_names:
                return True

            if part_text.endswith((".py", ".exe")):
                candidate_path = part_text
                if not os.path.isabs(candidate_path):
                    try:
                        proc_cwd = proc.cwd()
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError):
                        proc_cwd = None
                    if proc_cwd:
                        candidate_path = os.path.abspath(os.path.join(proc_cwd, candidate_path))

                if os.path.abspath(candidate_path).lower().startswith(normalized_app_dir + os.sep):
                    return True

        return False
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False


def _find_listening_pid(port: int) -> int | None:
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status != psutil.CONN_LISTEN:
                continue
            if not conn.laddr or conn.laddr.port != int(port):
                continue
            if conn.pid:
                return conn.pid
    except (psutil.AccessDenied, OSError):
        return None
    return None


def _get_process_by_pid(pid: int | None) -> psutil.Process | None:
    if not pid:
        return None
    try:
        proc = psutil.Process(pid)
        proc.info = proc.as_dict(attrs=["pid", "name", "exe", "cmdline"])
        return proc
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return None


def _serialize_process(proc: psutil.Process | None) -> dict | None:
    if proc is None:
        return None

    return {
        "pid": proc.info.get("pid") if hasattr(proc, "info") else proc.pid,
        "name": proc.info.get("name") if hasattr(proc, "info") else proc.name(),
        "exe": proc.info.get("exe") if hasattr(proc, "info") else None,
        "cmdline": proc.info.get("cmdline") if hasattr(proc, "info") else None,
    }


def get_service_instance_status(server_host: str, server_port: int) -> dict:
    """返回主服务实例状态，用于启动检查和诊断工具。"""
    app_dir = _get_app_dir()
    lock_path = _get_instance_lock_path(app_dir)
    lock_data = _read_instance_lock(lock_path)
    lock_pid = lock_data.get("pid") if lock_data else None
    lock_proc = _get_process_by_pid(lock_pid)
    if lock_proc and not _looks_like_clubmusic_process(lock_proc, app_dir):
        lock_proc = None
    lock_is_stale = bool(lock_data and lock_proc is None)

    port_busy = _is_port_accepting_connections(server_host, server_port)
    listening_pid = _find_listening_pid(server_port)
    listening_proc = _get_process_by_pid(listening_pid)
    listening_is_clubmusic = bool(listening_proc and _looks_like_clubmusic_process(listening_proc, app_dir))

    existing_proc = lock_proc
    existing_source = "lock"
    if existing_proc is None and listening_is_clubmusic:
        existing_proc = listening_proc
        existing_source = "port"

    instance_summary = None
    if existing_proc is not None:
        instance_summary = _build_instance_summary(
            server_host,
            server_port,
            existing_proc.pid,
            lock_path,
            lock_data,
        )

    return {
        "app_dir": app_dir,
        "lock_path": lock_path,
        "lock_exists": bool(lock_data),
        "lock_is_stale": lock_is_stale,
        "lock_data": lock_data,
        "lock_process": _serialize_process(lock_proc),
        "port_accepting": port_busy,
        "listening_pid": listening_pid,
        "listening_process": _serialize_process(listening_proc),
        "listening_is_clubmusic": listening_is_clubmusic,
        "existing_instance": _serialize_process(existing_proc),
        "existing_instance_source": existing_source if existing_proc is not None else None,
        "existing_instance_summary": instance_summary,
        "expected_url": f"http://{_normalize_host_for_probe(server_host)}:{int(server_port)}/",
    }


def cleanup_stale_instance_lock(server_host: str, server_port: int) -> bool:
    """删除无对应存活进程的陈旧实例锁。"""
    status = get_service_instance_status(server_host, server_port)
    if not status["lock_is_stale"]:
        return False

    _remove_instance_lock(status["lock_path"])
    return True


def _wait_for_port_release(host: str, port: int, timeout: float = 8.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not _is_port_accepting_connections(host, port):
            return True
        time.sleep(0.2)
    return not _is_port_accepting_connections(host, port)


def _terminate_existing_instance(proc: psutil.Process, logger=None):
    pid = proc.pid
    try:
        _log(logger, "warning", f"[Startup] 检测到已有 ClubMusic 实例，尝试接管: PID={pid}")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            _log(logger, "warning", f"[Startup] 旧实例未及时退出，强制终止: PID={pid}")
            proc.kill()
            proc.wait(timeout=3)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    except (psutil.AccessDenied, psutil.TimeoutExpired) as e:
        raise RuntimeError(f"无法结束旧实例 PID={pid}: {e}") from e


def _prompt_takeover(host: str, port: int, pid: int, lock_path: str, lock_data: dict | None = None) -> bool:
    summary = _build_instance_summary(host, port, pid, lock_path, lock_data)
    answer = input(
        f"\n[启动检查] 检测到已有 ClubMusic 实例正在运行:\n{summary}\n"
        "是否结束旧实例并由当前进程接管？[y/N]: "
    ).strip().lower()
    return answer in {"y", "yes"}


def ensure_single_service_instance(
    server_host: str,
    server_port: int,
    logger=None,
    interactive: bool = True,
    prompt_for_takeover: bool = True,
) -> str:
    """确保主服务只存在一个运行实例。

    返回当前进程持有的锁文件路径；若检测到旧实例且当前不接管，则抛出 RuntimeError。
    """
    global _ACTIVE_INSTANCE_LOCK_PATH

    if os.environ.get(_INSTANCE_LOCK_ENV) == "1" and _ACTIVE_INSTANCE_LOCK_PATH:
        return _ACTIVE_INSTANCE_LOCK_PATH

    status = get_service_instance_status(server_host, server_port)
    app_dir = status["app_dir"]
    lock_path = status["lock_path"]
    lock_data = status["lock_data"]
    current_pid = os.getpid()
    existing_proc = _get_process_by_pid((status["existing_instance"] or {}).get("pid"))
    port_busy = status["port_accepting"]
    listening_pid = status["listening_pid"]
    takeover_summary = None

    if lock_data:
        locked_pid = lock_data.get("pid")
        if locked_pid == current_pid:
            _ACTIVE_INSTANCE_LOCK_PATH = lock_path
            os.environ[_INSTANCE_LOCK_ENV] = "1"
            return lock_path

    if existing_proc and existing_proc.pid != current_pid and (port_busy or listening_pid == existing_proc.pid):
        takeover_summary = _build_instance_summary(
            server_host,
            server_port,
            existing_proc.pid,
            lock_path,
            lock_data,
        )
        should_takeover = interactive and prompt_for_takeover and _prompt_takeover(
            server_host,
            server_port,
            existing_proc.pid,
            lock_path,
            lock_data,
        )
        if not should_takeover:
            raise RuntimeError(
                "已有 ClubMusic 实例正在运行:\n"
                + _build_instance_summary(server_host, server_port, existing_proc.pid, lock_path, lock_data)
            )

        _terminate_existing_instance(existing_proc, logger=logger)
        _remove_instance_lock(lock_path)
        if not _wait_for_port_release(server_host, server_port):
            raise RuntimeError(f"旧实例已结束，但端口 {server_port} 仍未释放")

        port_busy = False
        listening_pid = None

    if port_busy and listening_pid and listening_pid != current_pid:
        proc = _get_process_by_pid(listening_pid)
        proc_name = proc.info.get("name") if proc else "unknown"
        raise RuntimeError(
            f"端口 {server_port} 已被占用 (PID={listening_pid}, name={proc_name})，"
            f"当前访问地址预期为 http://{_normalize_host_for_probe(server_host)}:{server_port}/"
        )

    payload = {
        "pid": current_pid,
        "host": server_host,
        "port": int(server_port),
        "app_dir": app_dir,
        "started_at": time.time(),
        "argv": sys.argv,
        "executable": sys.executable,
    }
    _write_instance_lock(lock_path, payload)

    def _cleanup_lock_on_exit():
        current_lock = _read_instance_lock(lock_path)
        if current_lock and current_lock.get("pid") != current_pid:
            return
        _remove_instance_lock(lock_path)

    atexit.register(_cleanup_lock_on_exit)
    _ACTIVE_INSTANCE_LOCK_PATH = lock_path
    os.environ[_INSTANCE_LOCK_ENV] = "1"
    _log(logger, "info", f"[Startup] 已获取服务实例锁: {lock_path}")
    if takeover_summary:
        _log(logger, "warning", f"[Startup] 当前实例已接管旧实例:\n{takeover_summary}")
    _log(
        logger,
        "info",
        "[Startup] 当前服务实例信息:\n"
        + _build_instance_summary(server_host, server_port, current_pid, lock_path, payload),
    )
    return lock_path


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