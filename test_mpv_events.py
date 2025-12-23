"""完整监听 MPV 事件流"""
import subprocess
import time
import json

PIPE_NAME = r"\\.\pipe\mpv-pipe"
TEST_FILE = r"Z:\Black Myth - Wukong FLAC\01. I See.flac"

def main():
    print("=" * 70)
    print("MPV 完整事件监听")
    print("=" * 70)
    
    # 停止现有 MPV
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True, timeout=5)
    time.sleep(1)
    
    # 启动 MPV
    print("\n启动 MPV...")
    mpv_cmd = [
        r"c:\mpv\mpv.exe",
        r"--input-ipc-server=\\.\pipe\mpv-pipe",
        "--idle=yes",
        "--force-window=no",
        "--no-terminal"
    ]
    
    proc = subprocess.Popen(
        mpv_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=0x00000200 | 0x08000000
    )
    print(f"PID: {proc.pid}")
    time.sleep(2)
    
    # 发送 loadfile 并监听所有事件
    print(f"\n发送 loadfile: {TEST_FILE}")
    print("\n监听事件流（10秒）...")
    print("-" * 70)
    
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            # 发送 loadfile
            cmd = {"command": ["loadfile", TEST_FILE, "replace"], "request_id": 1}
            f.write((json.dumps(cmd) + "\n").encode())
            f.flush()
            
            # 持续监听事件
            start = time.time()
            while time.time() - start < 10:
                line = f.readline()
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8", "ignore"))
                    ts = time.time() - start
                    
                    if "event" in obj:
                        event = obj.get("event")
                        # 特别关注 end-file 事件
                        if event == "end-file":
                            print(f"[{ts:.2f}s] ⚠️ END-FILE: {obj}")
                        else:
                            print(f"[{ts:.2f}s] 事件: {event}")
                            # 显示事件详情
                            extra = {k: v for k, v in obj.items() if k != "event"}
                            if extra:
                                print(f"         详情: {extra}")
                    else:
                        if obj.get("request_id"):
                            print(f"[{ts:.2f}s] 响应: {obj}")
                        
                except Exception as e:
                    print(f"解析错误: {e}")
                    continue
                    
    except Exception as e:
        print(f"错误: {e}")
    
    print("-" * 70)
    print("\n清理...")
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True, timeout=5)

if __name__ == "__main__":
    main()
