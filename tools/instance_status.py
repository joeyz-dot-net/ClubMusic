# -*- coding: utf-8 -*-
import sys

# Ensure stdout uses UTF-8 on Windows consoles.
if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

import argparse
import configparser
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from startup_cleanup import get_service_instance_status
from startup_cleanup import cleanup_stale_instance_lock


def parse_args():
    parser = argparse.ArgumentParser(
        description="Inspect ClubMusic single-instance lock and port state."
    )
    parser.add_argument(
        "--host",
        help="Service host to inspect. Defaults to settings.ini [app].server_host.",
    )
    parser.add_argument(
        "--port",
        type=int,
        help="Service port to inspect. Defaults to settings.ini [app].server_port.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full diagnostic payload as JSON.",
    )
    parser.add_argument(
        "--cleanup-stale-lock",
        action="store_true",
        help="Delete the lock file when it is stale and no matching live process exists.",
    )
    return parser.parse_args()


def load_default_host_port():
    config = configparser.ConfigParser()
    config_path = Path("settings.ini")
    if config_path.exists():
        config.read(config_path, encoding="utf-8")
    return (
        config.get("app", "server_host", fallback="0.0.0.0"),
        config.getint("app", "server_port", fallback=80),
    )


def print_human_readable(status: dict):
    print("ClubMusic 实例状态")
    print("=" * 40)
    print(f"预期地址: {status['expected_url']}")
    print(f"锁文件: {status['lock_path']}")
    print(f"锁文件存在: {'yes' if status['lock_exists'] else 'no'}")
    print(f"锁文件陈旧: {'yes' if status['lock_is_stale'] else 'no'}")
    print(f"端口可连接: {'yes' if status['port_accepting'] else 'no'}")

    if status["existing_instance_summary"]:
        print("\n已识别实例:")
        print(status["existing_instance_summary"])
        print(f"识别来源: {status['existing_instance_source']}")
    else:
        print("\n已识别实例: none")

    listener = status["listening_process"]
    if listener:
        print("\n端口监听进程:")
        print(f"PID={listener['pid']}")
        print(f"名称: {listener['name']}")
        print(f"命令行: {' '.join(listener.get('cmdline') or [])}")
        print(f"是否 ClubMusic: {'yes' if status['listening_is_clubmusic'] else 'no'}")


def main():
    args = parse_args()
    default_host, default_port = load_default_host_port()
    host = args.host or default_host
    port = args.port or default_port

    if args.cleanup_stale_lock:
        removed = cleanup_stale_instance_lock(host, port)
        print("已清理陈旧锁文件" if removed else "无需清理陈旧锁文件")

    status = get_service_instance_status(host, port)

    if args.json:
        print(json.dumps(status, ensure_ascii=False, indent=2))
        return

    print_human_readable(status)


if __name__ == "__main__":
    main()