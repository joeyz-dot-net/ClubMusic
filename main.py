# -*- coding: utf-8 -*-
"""
FastAPI 音乐播放器启动器（不依赖Flask）
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


def disable_uvicorn_access_logs():
    """禁用 uvicorn 的 HTTP 访问日志，但保留应用日志"""
    access_log = logging.getLogger("uvicorn.access")
    access_log.disabled = True


def get_mpv_audio_devices(mpv_path: str = "mpv") -> list:
    """获取 MPV 支持的 WASAPI 音频设备列表
    
    返回: [(device_id, device_name), ...]
    """
    devices = []
    try:
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
    """交互式选择音频输出设备
    
    参数:
        mpv_path: mpv 可执行文件路径
        timeout: 超时时间（秒），超时后使用默认值
    
    返回:
        设备ID (device_id 或 'auto')
    """
    print("\n" + "=" * 60)
    print("🎧 音频输出设备选择")
    print("=" * 60)
    
    devices = get_mpv_audio_devices(mpv_path)
    
    if not devices:
        print("\n❌ 未检测到音频设备，将使用系统默认")
        print("-" * 60)
        return "auto"
    
    # 查找 VB-Cable 设备作为默认选项
    default_choice = 0
    default_name = "系统默认设备"
    for idx, (device_id, device_name) in enumerate(devices, 1):
        if "CABLE Input" in device_name:
            default_choice = idx
            default_name = device_name
            break
    
    print(f"\n检测到 {len(devices)} 个音频设备:\n")
    print("  [0] 系统默认设备 (auto)")
    
    for idx, (device_id, device_name) in enumerate(devices, 1):
        # 显示完整设备名称（不截断）
        marker = " (默认)" if idx == default_choice else ""
        print(f"  [{idx}]{marker} {device_name}")
        print(f"       设备ID: {device_id}")
    
    print(f"\n请输入序号选择设备 (0-{len(devices)})，{timeout}秒后自动选择 VB-Cable...")
    print("-" * 60)
    
    # 使用线程实现超时输入
    selected = [None]
    
    def get_input():
        try:
            user_input = input(f"请选择 [{default_choice}]: ").strip()
            selected[0] = user_input if user_input else str(default_choice)
        except EOFError:
            selected[0] = str(default_choice)
    
    input_thread = threading.Thread(target=get_input, daemon=True)
    input_thread.start()
    input_thread.join(timeout=timeout)
    
    # 解析用户选择
    choice = selected[0] if selected[0] is not None else str(default_choice)
    
    try:
        choice_num = int(choice)
        if choice_num == 0:
            print("\n✅ 已选择: 系统默认设备 (auto)")
            return "auto"
        elif 1 <= choice_num <= len(devices):
            device_id, device_name = devices[choice_num - 1]
            print(f"\n✅ 已选择: {device_name}")
            print(f"   完整设备ID: {device_id}")
            return device_id
        else:
            # 无效选择，使用默认
            if default_choice > 0:
                device_id, device_name = devices[default_choice - 1]
                print(f"\n❌ 无效选择 '{choice}'，使用默认: {device_name}")
                print(f"   完整设备ID: {device_id}")
                return device_id
            else:
                print(f"\n❌ 无效选择 '{choice}'，使用系统默认设备")
                return "auto"
    except ValueError:
        # 解析失败，使用默认
        if default_choice > 0:
            device_id, device_name = devices[default_choice - 1]
            print(f"\n❌ 无效选择 '{choice}'，使用默认: {device_name}")
            print(f"   完整设备ID: {device_id}")
            return device_id
        else:
            print(f"\n❌ 无效选择 '{choice}'，使用系统默认设备")
            return "auto"


def interactive_select_streaming_mode(timeout: int = 10) -> bool:
    """交互式选择是否启用推流模式
    
    参数:
        timeout: 超时时间（秒），超时后使用默认值
    
    返回:
        True 启用推流，False 禁用推流
    """
    print("\n" + "=" * 60)
    print("🎙️  推流模式选择")
    print("=" * 60)
    
    print("\n请选择音频输出模式:\n")
    print("  [1] 本地播放 - 播放到本机音频设备")
    print("      ❌ 无法推流到浏览器")
    print("")
    print("  [2] 推流模式 - 通过 VB-Cable + FFmpeg 推流到浏览器")
    print("      ⚠️  需要安装 VB-Cable 和 FFmpeg")    
    print(f"\n请输入序号选择 (1-2)，{timeout}秒后自动选择本地播放...")
    print("-" * 60)
    
    # 使用线程实现超时输入
    selected = [None]
    
    def get_input():
        try:
            user_input = input("请选择 [1]: ").strip()
            selected[0] = user_input if user_input else "1"
        except EOFError:
            selected[0] = "1"
    
    input_thread = threading.Thread(target=get_input, daemon=True)
    input_thread.start()
    input_thread.join(timeout=timeout)
    
    # 解析用户选择
    choice = selected[0] if selected[0] is not None else "1"
    
    try:
        choice_num = int(choice)
        if choice_num == 2:
            print("\n✅ 已选择: 推流模式")
            print("   音频将通过 VB-Cable 推流到浏览器")
            return True
        else:
            print("\n✅ 已选择: 本地播放模式")
            print("   音频仅播放到本机音频设备")
            return False
    except ValueError:
        print(f"\n❌ 无效选择 '{choice}'，默认本地播放模式")
        return False


def update_mpv_cmd_with_device(config: configparser.ConfigParser, device_id: str) -> str:
    """更新 mpv_cmd 配置，添加音频设备参数
    
    参数:
        config: 配置解析器
        device_id: 设备ID，'auto' 表示使用系统默认
    
    返回:
        更新后的 mpv_cmd
    """
    mpv_cmd = config.get("app", "mpv_cmd", fallback="mpv --idle=yes")
    
    # 移除现有的 --audio-device 参数
    mpv_cmd = re.sub(r'\s*--audio-device=[^\s]+', '', mpv_cmd)
    
    # 如果不是 auto，添加设备参数
    if device_id != "auto":
        mpv_cmd = mpv_cmd.strip() + f" --audio-device={device_id}"
    
    return mpv_cmd


def main():
    """启动 FastAPI 服务器"""
    import sys
    import io
    import os
    import configparser
    import threading
    import re
    from pathlib import Path
    
    # 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
    if sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    
    # 导入日志模块
    from models.logger import setup_logging, logger
    
    # 设置日志
    setup_logging()
    
    # 禁用 uvicorn 访问日志
    disable_uvicorn_access_logs()
    
    print("\n" + "=" * 60)
    print("🎵 音乐播放器启动中...")
    print("=" * 60)
    
    # 加载配置文件
    config = configparser.ConfigParser()
    config_file = Path("settings.ini")
    if config_file.exists():
        config.read(config_file, encoding="utf-8")
    
    # 【第一步】交互式选择音频设备（默认VB-Cable）
    mpv_path = config.get("app", "mpv_cmd", fallback="mpv").split()[0]
    selected_device = interactive_select_audio_device(mpv_path=mpv_path, timeout=10)
    
    # 更新 mpv_cmd 配置
    if not config.has_section("app"):
        config.add_section("app")
    
    new_mpv_cmd = update_mpv_cmd_with_device(config, selected_device)
    config.set("app", "mpv_cmd", new_mpv_cmd)
    print(f"\n[配置] MPV 命令已更新")
    
    if selected_device != "auto":
        os.environ["MPV_AUDIO_DEVICE"] = selected_device
    
    # 【第二步】交互式选择推流模式（默认不启用）
    enable_streaming = interactive_select_streaming_mode(timeout=10)
    
    # 根据推流选择更新 enable_stream
    config.set("app", "enable_stream", "true" if enable_streaming else "false")
    
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
    print(f"\n   🎙️  推流模式: {'启用 ✅' if enable_streaming else '禁用 ❌'}")
    print("\n" + "=" * 60 + "\n")
    
    # 导入 FastAPI 应用实例
    from app import app as fastapi_app
    
    # 启动 FastAPI 服务器
    import uvicorn
    
    server_host = config.get("app", "server_host", fallback="0.0.0.0")
    server_port = config.getint("app", "server_port", fallback=80)
    
    uvicorn.run(
        fastapi_app,
        host=server_host,
        port=server_port,
        reload=False,  # 禁用自动重载（settings.ini 需要手动重启）
        log_config=None,  # 使用自定义日志配置
        access_log=False  # 禁用访问日志
    )


if __name__ == "__main__":
    main()
