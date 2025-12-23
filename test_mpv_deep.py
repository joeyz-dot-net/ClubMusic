"""更详细的 MPV 诊断 - 检查为何 loadfile 不生效"""
import json
import time
import os
import threading

PIPE_NAME = r"\\.\pipe\mpv-pipe"

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

def mpv_command_with_response(cmd_list, req_id=99):
    """发送命令并获取响应"""
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            payload = {"command": cmd_list, "request_id": req_id}
            cmd_json = json.dumps(payload) + "\n"
            print(f"发送: {cmd_json.strip()}")
            f.write(cmd_json.encode("utf-8"))
            f.flush()
            
            # 读取所有响应（包括事件）
            responses = []
            start = time.time()
            while time.time() - start < 3:  # 等待3秒
                try:
                    f.settimeout = 0.5
                    line = f.readline()
                    if line:
                        obj = json.loads(line.decode("utf-8", "ignore"))
                        responses.append(obj)
                        print(f"  收到: {obj}")
                        if obj.get("request_id") == req_id:
                            break
                except:
                    pass
            return responses
    except Exception as e:
        print(f"命令失败: {e}")
        return []

def listen_events(duration=5):
    """监听 MPV 事件"""
    print(f"\n监听 MPV 事件 {duration} 秒...")
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            # 先启用某些事件观察
            f.write(b'{"command": ["observe_property", 1, "idle-active"]}\n')
            f.write(b'{"command": ["observe_property", 2, "core-idle"]}\n')
            f.write(b'{"command": ["observe_property", 3, "path"]}\n')
            f.flush()
            
            start = time.time()
            while time.time() - start < duration:
                try:
                    line = f.readline()
                    if line:
                        obj = json.loads(line.decode("utf-8", "ignore"))
                        event = obj.get("event")
                        if event:
                            print(f"  事件: {event} -> {obj}")
                        elif "name" in obj:  # property change
                            print(f"  属性变化: {obj.get('name')} = {obj.get('data')}")
                except:
                    pass
    except Exception as e:
        print(f"监听失败: {e}")

def main():
    print("=" * 70)
    print("MPV 深度诊断 - 检查 loadfile 问题")
    print("=" * 70)
    
    # 1. 检查 mpv 版本
    print("\n1. 获取 MPV 版本...")
    resp = mpv_request({"command": ["get_property", "mpv-version"], "request_id": 1})
    if resp:
        print(f"   mpv-version: {resp.get('data')}")
    
    # 2. 检查当前状态
    print("\n2. 当前状态...")
    for prop in ["idle-active", "core-idle", "pause", "path", "filename"]:
        resp = mpv_request({"command": ["get_property", prop], "request_id": 2})
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    # 3. 找到测试文件
    test_file = None
    print("\n3. 查找测试文件...")
    for root, dirs, files in os.walk("Z:\\"):
        for f in files:
            if f.lower().endswith(".flac"):
                test_file = os.path.join(root, f)
                break
        if test_file:
            break
    
    if not test_file:
        print("   ❌ 没有找到测试文件")
        return
    
    print(f"   找到: {test_file}")
    print(f"   文件存在: {os.path.exists(test_file)}")
    
    # 4. 使用 loadfile 并监听响应
    print("\n4. 发送 loadfile 命令并监听响应...")
    responses = mpv_command_with_response(["loadfile", test_file, "replace"], req_id=100)
    
    # 5. 等待并检查状态
    print("\n5. 等待2秒后检查状态...")
    time.sleep(2)
    
    for prop in ["idle-active", "core-idle", "pause", "path", "filename", "time-pos", "duration"]:
        resp = mpv_request({"command": ["get_property", prop], "request_id": 200})
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    # 6. 尝试使用不同的路径格式
    print("\n6. 尝试不同路径格式...")
    
    # 使用正斜杠
    test_file_forward = test_file.replace("\\", "/")
    print(f"   正斜杠格式: {test_file_forward}")
    responses = mpv_command_with_response(["loadfile", test_file_forward, "replace"], req_id=300)
    
    time.sleep(2)
    for prop in ["idle-active", "path", "time-pos"]:
        resp = mpv_request({"command": ["get_property", prop], "request_id": 400})
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    # 7. 检查是否需要取消 idle
    print("\n7. 尝试先设置 idle=no 再加载...")
    mpv_command_with_response(["set_property", "idle", False], req_id=500)
    mpv_command_with_response(["loadfile", test_file_forward, "replace"], req_id=501)
    
    time.sleep(2)
    for prop in ["idle-active", "core-idle", "path", "time-pos"]:
        resp = mpv_request({"command": ["get_property", prop], "request_id": 600})
        if resp:
            print(f"   {prop}: {resp.get('data')} (error: {resp.get('error')})")
    
    print("\n" + "=" * 70)
    print("诊断完成")

if __name__ == "__main__":
    main()
