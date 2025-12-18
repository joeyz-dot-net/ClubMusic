#!/usr/bin/env python3
"""
快速测试脚本：验证修复是否有效
1. 启动应用
2. 等待准备就绪
3. 模拟播放和推流
"""

import time
import subprocess
import sys
import os

def main():
    print("=" * 60)
    print("🚀 启动音乐播放器应用...")
    print("=" * 60)
    
    # 启动应用
    app_process = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=r"c:\Users\hnzzy\OneDrive\Desktop\MusicPlayer",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    print("⏳ 等待应用启动...")
    time.sleep(5)
    
    print("\n✅ 应用已启动！")
    print("\n测试步骤：")
    print("1. 在浏览器中打开 http://127.0.0.1:80")
    print("2. 选择播放一首歌曲")
    print("3. 打开调试面板 (F12) 并启用推流")
    print("4. 监控控制台日志，确认播放 2+ 分钟没有停止")
    print("\n注意：")
    print("- 检查是否有 '广播失败' 日志")
    print("- 检查是否有 '客户端队列满' 日志")
    print("- 确保 FFmpeg 进程持续运行")
    print("\n按 Ctrl+C 停止应用...")
    print("=" * 60)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n📤 停止应用...")
        app_process.terminate()
        app_process.wait(timeout=5)
        print("✓ 应用已停止")

if __name__ == "__main__":
    main()
