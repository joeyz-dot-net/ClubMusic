# -*- coding: utf-8 -*-
"""
ClubMusic 启动器
"""

import sys
import os
import logging
import subprocess
import threading
import re

# 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
if sys.stdout.encoding != "utf-8":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import uvicorn
import configparser

# 导入日志模块
from models.logger import setup_logging, logger
from startup_cleanup import cleanup_stale_mpv_processes, ensure_single_service_instance, get_service_instance_status


def disable_uvicorn_access_logs():
    """禁用 uvicorn 的 HTTP 访问日志，但保留应用日志"""
    access_log = logging.getLogger("uvicorn.access")
    access_log.disabled = True


def _supports_interactive_startup_prompts(stdin=None) -> bool:
    override = (os.environ.get("CLUBMUSIC_STARTUP_PROMPTS") or "").strip().lower()
    if override in {"0", "false", "no", "off"}:
        return False
    if override in {"1", "true", "yes", "on"}:
        return True

    target = stdin if stdin is not None else getattr(sys, "stdin", None)
    return bool(target and hasattr(target, "isatty") and target.isatty())


def _status_has_running_clubmusic_instance(status: dict) -> bool:
    return bool(
        status.get("existing_instance_summary")
        and status.get("port_accepting")
        and status.get("listening_is_clubmusic")
    )


def _report_existing_clubmusic_instance(status: dict):
    print("\n[启动检查] 检测到已有 ClubMusic 实例正在运行，沿用现有实例:")
    print(status["existing_instance_summary"])
    print(f"访问地址: {status['expected_url']}")


def get_mpv_audio_devices(mpv_path: str = "mpv") -> list:
    """获取 MPV 支持的 WASAPI 音频设备列表

    返回: [(device_id, device_name), ...]
    """
    devices = []
    try:
        # 验证 mpv 可执行文件是否存在
        if not os.path.isfile(mpv_path):
            # 尝试在系统 PATH 中查找
            import shutil
            mpv_in_path = shutil.which('mpv')
            if mpv_in_path:
                print(f"[音频设备检测] 使用系统 PATH 中的 mpv: {mpv_in_path}")
                mpv_path = mpv_in_path
            else:
                print(f"[警告] mpv 可执行文件不存在: {mpv_path}")
                print(f"[提示] 请确保 mpv.exe 位于 bin 目录或系统 PATH 中")
                return devices

        result = subprocess.run(
            [mpv_path, "--audio-device=help"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )

        output = result.stdout + result.stderr

        # 解析 wasapi 设备
        # 格式: 'wasapi/{guid}' (Device Name)
        pattern = r"'(wasapi/\{[^}]+\})'\s+\(([^)]+)\)"
        matches = re.findall(pattern, output)

        for device_id, device_name in matches:
            devices.append((device_id, device_name))

    except Exception as e:
        print(f"[警告] 获取音频设备列表失败: {e}")

    return devices


def interactive_select_audio_device(mpv_path: str = "mpv", timeout: int = 10) -> str:
    """交互式选择音频输出设备（使用上下键选择）

    参数:
        mpv_path: mpv 可执行文件路径
        timeout: 超时时间（秒），超时后使用默认值

    返回:
        设备ID (device_id 或 'auto')
    """
    import time

    # ANSI 颜色码
    GREEN = '\033[92m'
    CYAN = '\033[96m'
    DIM = '\033[2m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

    print("\n" + "╔" + "═" * 58 + "╗")
    print("║" + " " * 18 + "🎧 音频输出设备选择" + " " * 18 + "║")
    print("╚" + "═" * 58 + "╝")

    devices = get_mpv_audio_devices(mpv_path)

    if not devices:
        print("\n❌ 未检测到音频设备，将使用系统默认")
        print("─" * 60)
        return "auto"

    # 构建选项列表: [(display_name, device_id_or_auto), ...]
    options = [("系统默认设备 (auto)", "auto")]
    for device_id, device_name in devices:
        options.append((device_name, device_id))

    # 默认优先选择 CABLE 虚拟音频设备
    default_index = 0  # 默认: 系统默认设备

    def is_16ch(name: str) -> bool:
        return "16ch" in (name or "").lower()

    # 优先级 1: CABLE-B Input 或包含 VB-Audio Virtual Cable B
    for idx, (device_id, device_name) in enumerate(devices):
        if is_16ch(device_name):
            continue
        if "CABLE-B Input" in device_name or "vb-audio virtual cable b" in device_name.lower():
            default_index = idx + 1  # +1 因为 options[0] 是 "系统默认"
            break

    # 优先级 2: CABLE-A Input
    if default_index == 0:
        for idx, (device_id, device_name) in enumerate(devices):
            if is_16ch(device_name):
                continue
            if "CABLE-A Input" in device_name:
                default_index = idx + 1
                break

    # 优先级 3: 通用 CABLE Input
    if default_index == 0:
        for idx, (device_id, device_name) in enumerate(devices):
            if is_16ch(device_name):
                continue
            if "CABLE" in device_name and "Input" in device_name:
                default_index = idx + 1
                break

    selected_index = default_index
    total_options = len(options)

    def render_menu(sel_idx, remaining=None):
        """渲染选择菜单（每行自带清行，支持原地重绘）"""
        for i, (name, dev_id) in enumerate(options):
            if i == sel_idx:
                print(f"\033[2K  {GREEN}{BOLD}► {name}{RESET}")
            else:
                print(f"\033[2K    {DIM}{name}{RESET}")

        # 底部提示行（不换行，光标停在本行末尾）
        if remaining is not None:
            print(f"\033[2K  {DIM}↑↓ 选择  Enter 确认  [{remaining}s 后自动选择]{RESET}", end="", flush=True)
        else:
            print(f"\033[2K  {DIM}↑↓ 选择  Enter 确认{RESET}", end="", flush=True)

    def move_to_menu_top():
        """光标回到菜单第一行（从提示行上移 total_options 行）"""
        if total_options > 0:
            print(f"\033[{total_options}F", end="", flush=True)

    print(f"\n检测到 {CYAN}{len(devices)}{RESET} 个音频设备:\n")

    # 首次渲染
    render_menu(selected_index, remaining=timeout)

    # ── 键盘输入循环 ──
    if os.name == 'nt':
        import msvcrt

        start_time = time.time()
        countdown_cancelled = False
        last_remaining = timeout + 1

        while True:
            elapsed = time.time() - start_time
            remaining = max(0, timeout - int(elapsed))

            # 更新倒计时显示
            if not countdown_cancelled and remaining != last_remaining:
                last_remaining = remaining
                move_to_menu_top()
                render_menu(selected_index, remaining=remaining)

            if msvcrt.kbhit():
                char = msvcrt.getwch()

                # 任意按键取消倒计时
                if not countdown_cancelled:
                    countdown_cancelled = True

                if char in ('\xe0', '\x00'):
                    # 特殊键前缀，读取第二个字节
                    arrow = msvcrt.getwch()
                    if arrow == 'H':  # 上
                        selected_index = (selected_index - 1) % total_options
                    elif arrow == 'P':  # 下
                        selected_index = (selected_index + 1) % total_options
                    # 重绘
                    move_to_menu_top()
                    render_menu(selected_index, remaining=None if countdown_cancelled else remaining)
                elif char == '\r':  # Enter
                    break
                elif char == '\x03':  # Ctrl+C
                    raise KeyboardInterrupt

            # 超时自动选择
            if not countdown_cancelled and elapsed >= timeout:
                break

            time.sleep(0.03)
    else:
        # 非 Windows: 使用 tty/termios 读取原始输入
        import select
        try:
            import tty
            import termios
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            tty.setraw(fd)

            start_time = time.time()
            countdown_cancelled = False
            last_remaining = timeout + 1

            while True:
                elapsed = time.time() - start_time
                remaining = max(0, timeout - int(elapsed))

                if not countdown_cancelled and remaining != last_remaining:
                    last_remaining = remaining
                    move_to_menu_top()
                    render_menu(selected_index, remaining=remaining)

                # 使用 select 实现非阻塞读取
                rlist, _, _ = select.select([sys.stdin], [], [], 0.03)
                if rlist:
                    char = sys.stdin.read(1)

                    if not countdown_cancelled:
                        countdown_cancelled = True

                    if char == '\x1b':
                        # 可能是转义序列
                        next1 = sys.stdin.read(1)
                        if next1 == '[':
                            next2 = sys.stdin.read(1)
                            if next2 == 'A':  # 上
                                selected_index = (selected_index - 1) % total_options
                            elif next2 == 'B':  # 下
                                selected_index = (selected_index + 1) % total_options
                            move_to_menu_top()
                            render_menu(selected_index, remaining=None if countdown_cancelled else remaining)
                    elif char in ('\r', '\n'):  # Enter
                        break
                    elif char == '\x03':  # Ctrl+C
                        raise KeyboardInterrupt

                if not countdown_cancelled and elapsed >= timeout:
                    break
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

    # ── 输出最终选择 ──
    # 清除菜单区域，显示最终结果
    move_to_menu_top()
    chosen_name, chosen_id = options[selected_index]
    print(f"\033[2K  {GREEN}{BOLD}✅ 已选择: {chosen_name}{RESET}")
    # 清除剩余的旧菜单行
    for _ in range(total_options):
        print("\033[2K")
    return chosen_id


def update_mpv_cmd_with_device(config: configparser.ConfigParser, device_id: str) -> str:
    """更新 mpv_cmd 配置，添加音频设备参数

    参数:
        config: 配置解析器
        device_id: 设备ID，'auto' 表示使用系统默认

    返回:
        更新后的 mpv_cmd
    """
    # 获取主程序目录
    if getattr(sys, 'frozen', False):
        app_dir = os.path.dirname(sys.executable)
    else:
        app_dir = os.path.dirname(os.path.abspath(__file__))

    bin_mpv = os.path.join(app_dir, "bin", "mpv.exe")

    # 获取现有的 mpv_cmd 配置并展开 ${bin_dir}
    mpv_cmd = config.get("app", "mpv_cmd", fallback="")
    mpv_cmd = mpv_cmd.replace("${bin_dir}", "bin")

    # 如果 bin 目录存在 mpv.exe，强制使用它，保留其他参数
    if os.path.exists(bin_mpv):
        if mpv_cmd:
            # 提取现有的参数（去掉可执行文件路径）
            parts = mpv_cmd.split(None, 1)
            params = parts[1] if len(parts) > 1 else "--idle=yes"
        else:
            params = "--idle=yes"
        # 构建新命令，使用 bin 目录的 mpv
        mpv_cmd = f'"{bin_mpv}" {params}'
    elif not mpv_cmd:
        # 如果没有配置且 bin 目录也没有，使用默认值
        mpv_cmd = "mpv --idle=yes"

    # 移除现有的 --audio-device 参数
    mpv_cmd = re.sub(r'\s*--audio-device=[^\s]+', '', mpv_cmd)

    # 如果不是 auto，添加设备参数
    if device_id != "auto":
        mpv_cmd = mpv_cmd.strip() + f" --audio-device={device_id}"

    return mpv_cmd


def cleanup_on_exit():
    """程序退出时的清理函数"""
    try:
        from routers.state import PLAYER
        if PLAYER and PLAYER.mpv_process and PLAYER.mpv_process.poll() is None:
            pid = PLAYER.mpv_process.pid
            PLAYER.mpv_process.terminate()
            try:
                PLAYER.mpv_process.wait(timeout=3)
            except Exception:
                PLAYER.mpv_process.kill()
            print(f"\n✅ MPV 进程已清理 (PID={pid})")
    except Exception:
        pass


def main():
    """启动 FastAPI 服务器"""
    import sys
    import io
    import os
    import configparser
    import threading
    import re
    import signal
    import atexit
    from pathlib import Path

    # 注册退出时清理函数
    atexit.register(cleanup_on_exit)

    # 处理 Ctrl+C 信号
    def signal_handler(sig, frame):
        print("\n\n⚠️  收到中断信号，正在清理...")
        cleanup_on_exit()
        # 使用 os._exit(0) 避免 SystemExit 异常导致的 traceback
        import os
        os._exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, signal_handler)

    # 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
    if sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    # 导入日志模块
    from models.logger import setup_logging, logger

    # 加载配置文件
    config = configparser.ConfigParser()
    config_file = Path("settings.ini")
    if config_file.exists():
        config.read(config_file, encoding="utf-8")

    # 设置日志
    setup_logging()

    cleanup_stale_mpv_processes(logger=logger)

    server_host = config.get("app", "server_host", fallback="0.0.0.0")
    server_port = config.getint("app", "server_port", fallback=80)

    startup_prompts_enabled = _supports_interactive_startup_prompts()

    try:
        ensure_single_service_instance(
            server_host=server_host,
            server_port=server_port,
            logger=logger,
            interactive=startup_prompts_enabled,
            prompt_for_takeover=startup_prompts_enabled,
        )
    except RuntimeError as e:
        status = get_service_instance_status(server_host, server_port)
        if _status_has_running_clubmusic_instance(status):
            _report_existing_clubmusic_instance(status)
            return
        print(f"\n[启动检查] {e}")
        raise SystemExit(1) from e

    # 禁用 uvicorn 访问日志
    disable_uvicorn_access_logs()

    print("\n" + "=" * 60)
    print("🎵 ClubMusic 启动中...")
    print("=" * 60)

    # 【第一步】交互式选择音频设备
    # 获取主程序目录
    if getattr(sys, 'frozen', False):
        app_dir = os.path.dirname(sys.executable)
    else:
        app_dir = os.path.dirname(os.path.abspath(__file__))

    bin_dir = os.path.join(app_dir, "bin")
    bin_mpv = os.path.join(bin_dir, "mpv.exe")

    logger.info(f"主程序目录: {app_dir}")
    logger.info(f"检查 MPV 路径: {bin_mpv}")

    # 确定实际使用的 mpv 路径（优先使用 bin 目录）
    if os.path.exists(bin_mpv):
        mpv_path = bin_mpv
        logger.info(f"✓ 找到 MPV: {bin_mpv}")
    else:
        # 尝试系统 PATH
        import shutil
        mpv_in_path = shutil.which('mpv')
        if mpv_in_path:
            mpv_path = mpv_in_path
            logger.info(f"✓ 使用系统 PATH 中的 MPV: {mpv_in_path}")
        else:
            logger.warning(f"✗ 未找到 MPV 可执行文件")
            logger.warning(f"  - 检查路径: {bin_mpv}")
            logger.warning(f"  - 系统 PATH 也未找到")
            mpv_path = "mpv"  # 使用默认值，让后续代码处理

    # 从配置文件读取启动超时时间
    startup_timeout = config.getint("app", "startup_timeout", fallback=10)
    selected_device = interactive_select_audio_device(mpv_path=mpv_path, timeout=startup_timeout)

    # 更新 mpv_cmd 配置
    if not config.has_section("app"):
        config.add_section("app")

    new_mpv_cmd = update_mpv_cmd_with_device(config, selected_device)
    config.set("app", "mpv_cmd", new_mpv_cmd)
    print(f"\n[配置] MPV 命令已更新")

    if selected_device != "auto":
        os.environ["MPV_AUDIO_DEVICE"] = selected_device

    # 显示完整设备名称和设备ID
    device_display = '系统默认 (auto)'
    device_id_display = 'N/A'

    if selected_device != 'auto':
        # 尝试获取完整设备名称
        devices = get_mpv_audio_devices(mpv_path)
        for device_id, device_name in devices:
            if device_id == selected_device:
                device_display = device_name
                device_id_display = device_id
                break
        # 如果没找到对应设备名称，直接显示设备ID
        if device_id_display == 'N/A':
            device_display = selected_device
            device_id_display = selected_device

    print("\n" + "=" * 60)
    print("✅ 启动配置完成")
    print("=" * 60)
    print(f"\n   🎧 音频设备:")
    print(f"      名称: {device_display}")
    if selected_device != 'auto':
        print(f"      设备ID: {device_id_display}")
    print("\n" + "=" * 60 + "\n")

    # 导入 FastAPI 应用实例
    from app import app as fastapi_app

    # 启动 FastAPI 服务器
    import uvicorn

    uvicorn.run(
        fastapi_app,
        host=server_host,
        port=server_port,
        reload=False,  # 禁用自动重载（settings.ini 需要手动重启）
        log_config=None,  # 使用自定义日志配置
        access_log=False  # 禁用访问日志（避免高频 /status 轮询刷屏）
    )


if __name__ == "__main__":
    main()
