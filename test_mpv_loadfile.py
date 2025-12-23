"""测试 MPV loadfile 的正确参数"""
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

def mpv_command_with_resp(cmd_list, req_id):
    """发送命令并返回响应"""
    payload = {"command": cmd_list, "request_id": req_id}
    return mpv_request(payload)

def get_status():
    """获取当前状态"""
    props = {}
    for i, prop in enumerate(["idle-active", "core-idle", "pause", "path", "time-pos", "duration"]):
        resp = mpv_request({"command": ["get_property", prop], "request_id": 900 + i})
        if resp:
            props[prop] = resp.get("data") if resp.get("error") == "success" else f"ERROR: {resp.get('error')}"
    return props

def main():
    print("=" * 70)
    print("MPV loadfile 参数测试")
    print("=" * 70)
    
    # 检查文件
    print(f"\n测试文件: {TEST_FILE}")
    print(f"文件存在: {os.path.exists(TEST_FILE)}")
    
    # 初始状态
    print("\n1. 初始状态:")
    for k, v in get_status().items():
        print(f"   {k}: {v}")
    
    # 测试 1: loadfile 只用 replace（原代码方式）
    print("\n2. 测试 loadfile <file> replace:")
    resp = mpv_command_with_resp(["loadfile", TEST_FILE, "replace"], 100)
    print(f"   响应: {resp}")
    time.sleep(2)
    print("   状态:")
    for k, v in get_status().items():
        print(f"     {k}: {v}")
    
    # 测试 2: loadfile 加上 start=0 选项强制开始播放
    print("\n3. 测试 loadfile <file> replace start=0:")
    resp = mpv_command_with_resp(["loadfile", TEST_FILE, "replace", "start=0"], 200)
    print(f"   响应: {resp}")
    time.sleep(2)
    print("   状态:")
    for k, v in get_status().items():
        print(f"     {k}: {v}")
    
    # 测试 3: 使用 playlist-play-index 强制播放
    print("\n4. 使用 playlist-play-index 强制播放:")
    # 先添加文件
    resp = mpv_command_with_resp(["loadfile", TEST_FILE, "replace"], 300)
    print(f"   loadfile 响应: {resp}")
    # 然后设置 playlist-play-index
    resp = mpv_command_with_resp(["set_property", "playlist-play-index", 0], 301)
    print(f"   playlist-play-index 响应: {resp}")
    time.sleep(2)
    print("   状态:")
    for k, v in get_status().items():
        print(f"     {k}: {v}")
    
    # 测试 4: 直接用 loadfile + pause=no 选项
    print("\n5. 测试 loadfile <file> replace pause=no:")
    resp = mpv_command_with_resp(["loadfile", TEST_FILE, "replace", "pause=no"], 400)
    print(f"   响应: {resp}")
    time.sleep(2)
    print("   状态:")
    for k, v in get_status().items():
        print(f"     {k}: {v}")
    
    # 测试 5: 试试检查 mpv 的 --pause 启动参数
    print("\n6. 检查 pause 属性（可能 mpv 启动时暂停了）:")
    resp = mpv_request({"command": ["get_property", "pause"], "request_id": 500})
    print(f"   pause = {resp}")
    
    # 尝试取消暂停
    print("\n7. 尝试取消暂停并观察:")
    resp = mpv_command_with_resp(["set_property", "pause", False], 600)
    print(f"   set pause=false 响应: {resp}")
    time.sleep(2)
    print("   状态:")
    for k, v in get_status().items():
        print(f"     {k}: {v}")

    print("\n" + "=" * 70)
    print("测试完成")

if __name__ == "__main__":
    main()
