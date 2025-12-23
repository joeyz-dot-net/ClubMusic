"""测试直接命令行启动 MPV 播放"""
import subprocess
import time
import json
import os

PIPE_NAME = r"\\.\pipe\mpv-pipe"
TEST_FILE = r"Z:\Black Myth - Wukong FLAC\01. I See.flac"

def mpv_request(payload):
    """发送请求并等待响应"""
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            cmd_json = json.dumps(payload) + "\n"
            f.write(cmd_json.encode("utf-8"))
            f.flush()
            while True:
                line = f.readline()
                if not line:
                    break
                try:
                    obj = json.loads(line.decode("utf-8", "ignore"))
                    if obj.get("request_id") == payload.get("request_id"):
                        return obj
                except:
                    continue
    except Exception as e:
        print(f"请求失败: {e}")
    return None

def get_status():
    props = {}
    for i, prop in enumerate(["idle-active", "path", "time-pos", "duration", "ao-volume"]):
        resp = mpv_request({"command": ["get_property", prop], "request_id": 900 + i})
        if resp:
            props[prop] = resp.get("data") if resp.get("error") == "success" else f"ERR:{resp.get('error')}"
    return props

def main():
    print("=" * 70)
    print("MPV 启动参数测试")
    print("=" * 70)
    
    # 先停止现有 MPV
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    time.sleep(1)
    
    # 测试 1: 使用 --idle=yes (原始方式)
    print("\n测试 1: --idle=yes")
    print("-" * 50)
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        r"--input-ipc-server=\\.\pipe\mpv-pipe",
        "--idle=yes",
        "--force-window=no"
    ]
    print(f"命令: {' '.join(mpv_cmd)}")
    proc = subprocess.Popen(mpv_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"PID: {proc.pid}")
    time.sleep(2)
    
    # 检查管道
    try:
        with open(PIPE_NAME, "rb") as f:
            print("管道存在: True")
    except:
        print("管道存在: False")
        return
    
    # 发送 loadfile
    print("发送 loadfile...")
    resp = mpv_request({"command": ["loadfile", TEST_FILE, "replace"], "request_id": 1})
    print(f"响应: {resp}")
    
    time.sleep(2)
    status = get_status()
    for k, v in status.items():
        print(f"  {k}: {v}")
    
    # 停止
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    time.sleep(1)
    
    # 测试 2: 使用 --idle=once (可能更合适)
    print("\n测试 2: --idle=once")
    print("-" * 50)
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        r"--input-ipc-server=\\.\pipe\mpv-pipe",
        "--idle=once",
        "--force-window=no"
    ]
    print(f"命令: {' '.join(mpv_cmd)}")
    proc = subprocess.Popen(mpv_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"PID: {proc.pid}")
    time.sleep(2)
    
    # 发送 loadfile
    print("发送 loadfile...")
    resp = mpv_request({"command": ["loadfile", TEST_FILE, "replace"], "request_id": 1})
    print(f"响应: {resp}")
    
    time.sleep(2)
    status = get_status()
    for k, v in status.items():
        print(f"  {k}: {v}")
    
    # 停止
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    time.sleep(1)
    
    # 测试 3: 直接带文件启动（对比）
    print("\n测试 3: 直接带文件启动")
    print("-" * 50)
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        r"--input-ipc-server=\\.\pipe\mpv-pipe",
        "--force-window=no",
        TEST_FILE
    ]
    print(f"命令: {' '.join(mpv_cmd[:3])} <file>")
    proc = subprocess.Popen(mpv_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"PID: {proc.pid}")
    time.sleep(3)
    
    status = get_status()
    for k, v in status.items():
        print(f"  {k}: {v}")
    
    # 停止
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True)
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    main()
