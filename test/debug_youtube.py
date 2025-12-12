#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
YouTube 播放调试工具 - 诊断所有路径和配置问题
"""
import os
import sys
import subprocess
import json
import time

# 添加项目目录到路径
app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

print("=" * 70)
print("YouTube 播放调试工具 - 完整诊断")
print("=" * 70)

# 导入播放器
try:
    from models.player import MusicPlayer
    print("\n✓ 成功导入 MusicPlayer")
except Exception as e:
    print(f"\n✗ 导入 MusicPlayer 失败: {e}")
    sys.exit(1)

# 1. 检查路径
print("\n[1] 检查应用目录和文件路径")
print(f"  应用目录: {app_dir}")
print(f"  当前工作目录: {os.getcwd()}")

# 2. 检查 yt-dlp 位置
print("\n[2] 检查 yt-dlp.exe 位置")
app_yt_dlp = os.path.join(app_dir, "yt-dlp.exe")
print(f"  应用目录路径: {app_yt_dlp}")
print(f"  文件是否存在: {os.path.exists(app_yt_dlp)}")
if os.path.exists(app_yt_dlp):
    size = os.path.getsize(app_yt_dlp)
    print(f"  文件大小: {size:,} 字节")

# 尝试从 PATH 获取
try:
    result = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print(f"  PATH 中可用: {result.stdout.strip()}")
except:
    print(f"  PATH 中不可用")

# 3. 检查 mpv 配置
print("\n[3] 检查 MPV 配置")
player = MusicPlayer()
print(f"  MPV_CMD: {player.mpv_cmd}")
print(f"  Pipe 名称: {player.pipe_name}")

# 4. 测试播放列表检测
print("\n[4] 测试 yt-dlp 播放列表检测")
test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
print(f"  测试 URL: {test_url}")

yt_dlp_exe = "yt-dlp"
if os.path.exists(app_yt_dlp):
    yt_dlp_exe = app_yt_dlp
    print(f"  使用应用目录中的 yt-dlp: {app_yt_dlp}")
else:
    print(f"  使用 PATH 中的 yt-dlp")

try:
    cmd = [yt_dlp_exe, "--flat-playlist", "-j", test_url]
    print(f"  运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    print(f"  返回代码: {result.returncode}")
    
    if result.returncode == 0:
        lines = result.stdout.strip().split("\n")
        print(f"  ✓ 返回 {len(lines)} 行")
        if lines[0]:
            try:
                data = json.loads(lines[0])
                print(f"    类型: {data.get('_type', 'video')}")
                print(f"    标题: {data.get('title', '无')}")
            except:
                print(f"    (无法解析 JSON)")
    else:
        print(f"  ✗ 命令失败")
        if result.stderr:
            print(f"  错误输出:\n{result.stderr[:500]}")
except Exception as e:
    print(f"  ✗ 异常: {e}")

# 5. 测试 yt-dlp -g 获取直链
print("\n[5] 测试 yt-dlp -g 获取直链")
try:
    cmd = [yt_dlp_exe, "-g", test_url]
    print(f"  运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    print(f"  返回代码: {result.returncode}")
    
    if result.returncode == 0:
        urls = result.stdout.strip().split("\n")
        print(f"  ✓ 返回 {len(urls)} 条直链")
        for i, url in enumerate(urls[:2], 1):
            print(f"    [{i}] {url[:100]}...")
    else:
        print(f"  ✗ 命令失败")
        if result.stderr:
            print(f"  错误输出:\n{result.stderr[:500]}")
except Exception as e:
    print(f"  ✗ 异常: {e}")

# 6. 检查 MPV 启动
print("\n[6] 检查 MPV 启动情况")
try:
    result = subprocess.run(["mpv", "--version"], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        version_line = result.stdout.split("\n")[0]
        print(f"  ✓ 系统 mpv 可用: {version_line}")
    else:
        print(f"  ✗ 系统 mpv 返回异常代码")
except Exception as e:
    print(f"  ✗ 系统 mpv 不可用: {e}")
    
# 尝试找 mpv 文件
mpv_paths = [
    "mpv.exe",
    "c:\\mpv\\mpv.exe",
    "c:\\Program Files\\mpv\\mpv.exe",
    "c:\\Program Files (x86)\\mpv\\mpv.exe",
]
print(f"  检查常见 mpv 路径:")
for path in mpv_paths:
    exists = os.path.exists(path)
    status = "✓" if exists else "✗"
    print(f"    {status} {path}")

# 7. 测试 mpv 直接播放
print("\n[7] 测试 MPV 直接播放能力")
print(f"  使用 mpv 的 ytdl 播放 URL...")
print(f"  注意: 实际测试需要手动验证或在 UI 中测试")

# 8. 模拟播放器的 play_url 逻辑
print("\n[8] 模拟 MusicPlayer.play_url() 逻辑")
print(f"  URL: {test_url}")
print(f"  1. 检查 mpv pipe 存在: {player.mpv_pipe_exists()}")

if not player.mpv_pipe_exists():
    print(f"  2. pipe 不存在，需要启动 mpv")
    print(f"     将执行: subprocess.Popen({player.mpv_cmd}, shell=True)")
    print(f"     这会启动 mpv 并加载管道")
else:
    print(f"  2. pipe 已存在，可以直接发送命令")

print(f"  3. 将发送 loadfile 命令: mpv_command(['loadfile', '{test_url}', 'replace'])")

# 9. 显示配置文件内容
print("\n[9] 检查 settings.ini 配置")
ini_path = os.path.join(app_dir, "settings.ini")
if os.path.exists(ini_path):
    print(f"  文件路径: {ini_path}")
    with open(ini_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines:
        line = line.strip()
        if line and not line.startswith("["):
            print(f"    {line}")
else:
    print(f"  ✗ settings.ini 不存在")

print("\n" + "=" * 70)
print("诊断完成 - 请查看上述输出确认所有路径都正确")
print("=" * 70)
print("\n关键检查清单:")
print("  [ ] yt-dlp.exe 是否在应用目录中?")
print("  [ ] MPV_CMD 路径是否正确且可执行?")
print("  [ ] yt-dlp 和 mpv 都能正常运行?")
print("  [ ] 网络连接是否正常 (能访问 youtube.com)?")
