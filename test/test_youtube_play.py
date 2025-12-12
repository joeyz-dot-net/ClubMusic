#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
快速测试 YouTube 播放是否正常工作
"""
import subprocess
import os
import sys
import json

# 测试 URL
test_url = "https://www.youtube.com/watch?v=9bZkp7q19f0"  # 示例视频

print("="*60)
print("YouTube 播放诊断工具")
print("="*60)

# 1. 检查 yt-dlp 是否可用
print("\n[1] 检查 yt-dlp 可用性...")
yt_dlp_exe = None

# 检查 tools 目录
app_dir = os.path.dirname(os.path.abspath(__file__))
tools_yt_dlp = os.path.join(app_dir, "tools", "yt-dlp.exe")
if os.path.exists(tools_yt_dlp):
    yt_dlp_exe = tools_yt_dlp
    print(f"  ✓ 找到 yt-dlp: {tools_yt_dlp}")
else:
    print(f"  ✗ tools/yt-dlp.exe 不存在: {tools_yt_dlp}")
    # 尝试从 PATH
    try:
        result = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            yt_dlp_exe = "yt-dlp"
            print(f"  ✓ yt-dlp 在 PATH 中: {result.stdout.strip()}")
    except Exception as e:
        print(f"  ✗ yt-dlp 不在 PATH 中: {e}")

if not yt_dlp_exe:
    print("\n❌ 致命错误: 找不到 yt-dlp")
    sys.exit(1)

# 2. 测试 yt-dlp 获取播放列表信息
print(f"\n[2] 测试 yt-dlp --flat-playlist...")
try:
    cmd = [yt_dlp_exe, "--flat-playlist", "-j", test_url]
    print(f"  运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        lines = result.stdout.strip().split("\n")
        print(f"  ✓ 返回 {len(lines)} 行数据")
        if lines[0]:
            data = json.loads(lines[0])
            print(f"    - 视频/播放列表类型: {data.get('_type', 'video')}")
            if 'title' in data:
                print(f"    - 标题: {data['title']}")
    else:
        print(f"  ✗ 命令失败 (exit code {result.returncode})")
        if result.stderr:
            print(f"    错误: {result.stderr[:200]}")
except Exception as e:
    print(f"  ✗ 异常: {e}")

# 3. 测试 yt-dlp -g 获取直链
print(f"\n[3] 测试 yt-dlp -g 获取直链...")
try:
    cmd = [yt_dlp_exe, "-g", test_url]
    print(f"  运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        urls = result.stdout.strip().split("\n")
        print(f"  ✓ 返回 {len(urls)} 条直链")
        for i, url in enumerate(urls[:3], 1):
            print(f"    [{i}] {url[:80]}...")
    else:
        print(f"  ✗ 命令失败 (exit code {result.returncode})")
        if result.stderr:
            print(f"    错误: {result.stderr[:200]}")
except Exception as e:
    print(f"  ✗ 异常: {e}")

# 4. 检查 MPV
print(f"\n[4] 检查 mpv 可用性...")
try:
    result = subprocess.run(["mpv", "--version"], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        version_line = result.stdout.split("\n")[0]
        print(f"  ✓ mpv 可用: {version_line}")
    else:
        print(f"  ✗ mpv 返回异常代码: {result.returncode}")
except Exception as e:
    print(f"  ✗ mpv 不可用: {e}")

print("\n" + "="*60)
print("诊断完成")
print("="*60)
