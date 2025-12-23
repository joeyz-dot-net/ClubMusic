"""诊断 MPV 为何 loadfile 后不播放"""
import json
import time
import os

PIPE_NAME = r"\\.\pipe\mpv-pipe"
TEST_FILE = "Z:/Black Myth - Wukong FLAC/01. I See.flac"

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

def mpv_cmd(cmd_list, req_id):
    return mpv_request({"command": cmd_list, "request_id": req_id})

def main():
    print("=" * 70)
    print("MPV 播放诊断")
    print("=" * 70)
    
    # 1. 检查播放列表
    print("\n1. 检查播放列表...")
    resp = mpv_cmd(["get_property", "playlist"], 1)
    print(f"   playlist: {resp}")
    
    resp = mpv_cmd(["get_property", "playlist-count"], 2)
    print(f"   playlist-count: {resp}")
    
    resp = mpv_cmd(["get_property", "playlist-pos"], 3)
    print(f"   playlist-pos: {resp}")
    
    # 2. 检查 playback-abort
    print("\n2. 检查播放相关属性...")
    for prop in ["eof-reached", "playback-abort", "seeking", "ao-volume"]:
        resp = mpv_cmd(["get_property", prop], 10)
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    # 3. loadfile 并检查播放列表变化
    print("\n3. 执行 loadfile...")
    resp = mpv_cmd(["loadfile", TEST_FILE, "replace"], 100)
    print(f"   loadfile 响应: {resp}")
    
    time.sleep(0.5)
    
    # 4. 再次检查播放列表
    print("\n4. 再次检查播放列表...")
    resp = mpv_cmd(["get_property", "playlist"], 101)
    print(f"   playlist: {resp}")
    
    resp = mpv_cmd(["get_property", "playlist-count"], 102)
    print(f"   playlist-count: {resp}")
    
    resp = mpv_cmd(["get_property", "playlist-pos"], 103)
    print(f"   playlist-pos: {resp}")
    
    # 5. 尝试 playlist-next 或 playlist-play-index
    print("\n5. 尝试 playlist-next...")
    resp = mpv_cmd(["playlist-next"], 200)
    print(f"   playlist-next 响应: {resp}")
    
    time.sleep(2)
    
    # 6. 检查状态
    print("\n6. 检查播放状态...")
    for prop in ["idle-active", "path", "time-pos", "duration", "playlist-pos"]:
        resp = mpv_cmd(["get_property", prop], 300)
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    # 7. 尝试直接用 playlist-pos 设置为 0
    print("\n7. 设置 playlist-pos = 0...")
    resp = mpv_cmd(["set_property", "playlist-pos", 0], 400)
    print(f"   响应: {resp}")
    
    time.sleep(2)
    
    # 8. 最终状态
    print("\n8. 最终状态...")
    for prop in ["idle-active", "path", "time-pos", "duration"]:
        resp = mpv_cmd(["get_property", prop], 500)
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    main()
