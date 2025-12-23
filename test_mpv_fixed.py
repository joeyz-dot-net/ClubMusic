"""修复后的 MPV IPC 测试 - 正确处理事件流"""
import subprocess
import time
import json
import threading

PIPE_NAME = r"\\.\pipe\mpv-pipe"
TEST_FILE = r"Z:\Black Myth - Wukong FLAC\01. I See.flac"

def mpv_request_proper(prop_name, timeout=3):
    """正确处理 MPV 请求 - 读取直到找到匹配的 request_id"""
    req_id = int(time.time() * 1000) % 100000
    
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            cmd = {"command": ["get_property", prop_name], "request_id": req_id}
            f.write((json.dumps(cmd) + "\n").encode())
            f.flush()
            
            start = time.time()
            while time.time() - start < timeout:
                line = f.readline()
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8", "ignore"))
                    # 只返回匹配 request_id 的响应
                    if obj.get("request_id") == req_id:
                        return obj
                    # 忽略事件
                except:
                    continue
    except Exception as e:
        return {"error": str(e)}
    
    return {"error": "timeout"}

def main():
    print("=" * 70)
    print("MPV IPC 正确测试")
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
        "--no-terminal",  # 禁用终端输出
        "--ao=wasapi"     # 使用 WASAPI 音频输出（修复音频初始化失败）
    ]
    
    proc = subprocess.Popen(
        mpv_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=0x00000200 | 0x08000000  # CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
    )
    print(f"PID: {proc.pid}")
    time.sleep(2)
    
    # 检查初始状态
    print("\n1. 初始状态:")
    for prop in ["idle-active", "pause", "path"]:
        resp = mpv_request_proper(prop)
        val = resp.get("data") if resp.get("error") == "success" else f"ERR: {resp.get('error')}"
        print(f"   {prop}: {val}")
    
    # 发送 loadfile
    print("\n2. 发送 loadfile...")
    req_id = 9999
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            cmd = {"command": ["loadfile", TEST_FILE, "replace"], "request_id": req_id}
            f.write((json.dumps(cmd) + "\n").encode())
            f.flush()
            
            # 读取所有响应（包括事件）直到超时
            print("   读取响应...")
            start = time.time()
            events = []
            loadfile_resp = None
            
            while time.time() - start < 5:
                line = f.readline()
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8", "ignore"))
                    if obj.get("request_id") == req_id:
                        loadfile_resp = obj
                        print(f"   ✓ loadfile 响应: {obj}")
                    elif "event" in obj:
                        events.append(obj)
                        event_name = obj.get("event")
                        print(f"   → 事件: {event_name}")
                        if event_name == "playback-restart":
                            print("   ✓✓✓ 播放已开始!")
                            break
                except:
                    continue
            
            print(f"\n   总共收到 {len(events)} 个事件")
            
    except Exception as e:
        print(f"   错误: {e}")
    
    # 等待并检查最终状态
    print("\n3. 最终状态:")
    time.sleep(1)
    
    for prop in ["idle-active", "core-idle", "pause", "path", "time-pos", "duration", "ao"]:
        resp = mpv_request_proper(prop, timeout=2)
        val = resp.get("data") if resp.get("error") == "success" else f"ERR: {resp.get('error')}"
        print(f"   {prop}: {val}")
    
    # 清理
    print("\n清理...")
    subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True, timeout=5)
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    main()
