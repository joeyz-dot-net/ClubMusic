"""测试 MPV 并捕获错误输出"""
import subprocess
import time
import os

TEST_FILE = r"Z:\Black Myth - Wukong FLAC\01. I See.flac"

def main():
    print("=" * 70)
    print("MPV 错误输出诊断")
    print("=" * 70)
    
    # 先停止现有 MPV
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    time.sleep(1)
    
    # 检查文件
    print(f"\n测试文件: {TEST_FILE}")
    print(f"文件存在: {os.path.exists(TEST_FILE)}")
    print(f"文件大小: {os.path.getsize(TEST_FILE) if os.path.exists(TEST_FILE) else 'N/A'}")
    
    # 测试 1: 直接带文件启动，捕获输出
    print("\n" + "=" * 70)
    print("测试 1: 直接带文件启动 (捕获输出)")
    print("-" * 70)
    
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        "--force-window=no",
        "--no-video",
        "--really-quiet=no",
        "--msg-level=all=debug",
        TEST_FILE
    ]
    print(f"命令: {' '.join(mpv_cmd[:4])} <file>")
    
    result = subprocess.run(
        mpv_cmd,
        capture_output=True,
        text=True,
        timeout=10
    )
    
    print(f"\n返回码: {result.returncode}")
    if result.stdout:
        print(f"\n标准输出:\n{result.stdout[:2000]}")
    if result.stderr:
        print(f"\n标准错误:\n{result.stderr[:2000]}")
    
    # 测试 2: 使用 --ao=null 测试（排除音频设备问题）
    print("\n" + "=" * 70)
    print("测试 2: 使用 --ao=null (排除音频设备问题)")
    print("-" * 70)
    
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        "--force-window=no",
        "--no-video",
        "--ao=null",  # 使用空音频输出
        "--length=3",  # 只播放3秒
        TEST_FILE
    ]
    
    result = subprocess.run(
        mpv_cmd,
        capture_output=True,
        text=True,
        timeout=10
    )
    
    print(f"返回码: {result.returncode}")
    if result.stdout:
        print(f"标准输出:\n{result.stdout[:1000]}")
    if result.stderr:
        print(f"标准错误:\n{result.stderr[:1000]}")
    
    # 测试 3: 使用 IPC 模式启动
    print("\n" + "=" * 70)
    print("测试 3: IPC 模式启动 + verbose 日志")
    print("-" * 70)
    
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        r"--input-ipc-server=\\.\pipe\mpv-pipe",
        "--idle=yes",
        "--force-window=no",
        "--no-video",
        "--msg-level=all=info"
    ]
    
    # 启动为后台进程但捕获输出
    proc = subprocess.Popen(
        mpv_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    print(f"PID: {proc.pid}")
    time.sleep(2)
    
    # 检查是否还在运行
    if proc.poll() is None:
        print("进程状态: 运行中")
        
        # 发送 loadfile
        import json
        pipe_name = r"\\.\pipe\mpv-pipe"
        try:
            with open(pipe_name, "r+b", 0) as f:
                cmd = {"command": ["loadfile", TEST_FILE, "replace"], "request_id": 1}
                f.write((json.dumps(cmd) + "\n").encode())
                f.flush()
                
                # 等待响应
                line = f.readline()
                print(f"loadfile 响应: {line.decode('utf-8', 'ignore')}")
                
                time.sleep(2)
                
                # 检查状态
                for prop in ["idle-active", "path", "time-pos"]:
                    cmd = {"command": ["get_property", prop], "request_id": 2}
                    f.write((json.dumps(cmd) + "\n").encode())
                    f.flush()
                    line = f.readline()
                    print(f"{prop}: {line.decode('utf-8', 'ignore').strip()}")
        except Exception as e:
            print(f"IPC 错误: {e}")
        
        # 获取 MPV 的任何输出
        try:
            stdout, stderr = proc.communicate(timeout=1)
            if stdout:
                print(f"\nMPV stdout:\n{stdout[:1000]}")
            if stderr:
                print(f"\nMPV stderr:\n{stderr[:1000]}")
        except subprocess.TimeoutExpired:
            print("\n(MPV 仍在运行，终止它)")
            proc.terminate()
    else:
        print(f"进程状态: 已退出 (返回码: {proc.returncode})")
        stdout, stderr = proc.communicate()
        if stdout:
            print(f"stdout:\n{stdout[:1000]}")
        if stderr:
            print(f"stderr:\n{stderr[:1000]}")
    
    # 清理
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    main()
