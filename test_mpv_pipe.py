"""测试 MPV 管道通信"""
import json
import subprocess
import time
import os

PIPE_NAME = r"\\.\pipe\mpv-pipe"

def test_pipe_exists():
    """测试管道是否存在"""
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            return True
    except FileNotFoundError:
        return False

def mpv_request(payload):
    """发送请求并等待响应"""
    try:
        with open(PIPE_NAME, "r+b", 0) as f:
            cmd_json = json.dumps(payload) + "\n"
            print(f"发送: {cmd_json.strip()}")
            f.write(cmd_json.encode("utf-8"))
            f.flush()
            
            while True:
                line = f.readline()
                if not line:
                    print("没有响应")
                    break
                try:
                    obj = json.loads(line.decode("utf-8", "ignore"))
                    print(f"收到: {obj}")
                    if obj.get("request_id") == payload.get("request_id"):
                        return obj
                except Exception as e:
                    print(f"解析错误: {e}, 原始行: {line}")
                    continue
    except Exception as e:
        print(f"请求失败: {e}")
    return None

def mpv_command(cmd_list):
    """发送命令（不等待响应）"""
    try:
        with open(PIPE_NAME, "wb") as w:
            cmd_json = json.dumps({"command": cmd_list}) + "\n"
            print(f"发送命令: {cmd_json.strip()}")
            w.write(cmd_json.encode("utf-8"))
            return True
    except Exception as e:
        print(f"命令失败: {e}")
        return False

def main():
    print("=" * 60)
    print("MPV 管道通信测试")
    print("=" * 60)
    
    # 1. 检查管道
    print("\n1. 检查管道存在...")
    if not test_pipe_exists():
        print("❌ 管道不存在，请先启动 MPV")
        return
    print("✅ 管道存在")
    
    # 2. 测试获取 idle-active 状态
    print("\n2. 测试获取 idle-active...")
    resp = mpv_request({"command": ["get_property", "idle-active"], "request_id": 1})
    if resp:
        print(f"   idle-active = {resp.get('data')}")
    
    # 3. 测试获取 pause 状态
    print("\n3. 测试获取 pause...")
    resp = mpv_request({"command": ["get_property", "pause"], "request_id": 2})
    if resp:
        print(f"   pause = {resp.get('data')}")
    
    # 4. 测试获取 time-pos
    print("\n4. 测试获取 time-pos...")
    resp = mpv_request({"command": ["get_property", "time-pos"], "request_id": 3})
    if resp:
        print(f"   time-pos = {resp.get('data')}")
        if resp.get("error") == "property unavailable":
            print("   ⚠️ 没有正在播放的文件")
    
    # 5. 测试获取 duration
    print("\n5. 测试获取 duration...")
    resp = mpv_request({"command": ["get_property", "duration"], "request_id": 4})
    if resp:
        print(f"   duration = {resp.get('data')}")
    
    # 6. 测试加载文件
    print("\n6. 测试加载测试文件...")
    # 查找一个测试音频文件
    test_files = []
    for root, dirs, files in os.walk("Z:\\"):
        for f in files:
            if f.lower().endswith((".mp3", ".wav", ".flac")):
                test_files.append(os.path.join(root, f))
                if len(test_files) >= 1:
                    break
        if test_files:
            break
    
    if test_files:
        test_file = test_files[0]
        print(f"   找到测试文件: {test_file}")
        
        # 使用 loadfile 命令
        success = mpv_command(["loadfile", test_file, "replace"])
        if success:
            print("   ✅ loadfile 命令已发送")
            
            # 等待加载
            time.sleep(2)
            
            # 再次检查状态
            print("\n7. 加载后再次检查状态...")
            
            resp = mpv_request({"command": ["get_property", "idle-active"], "request_id": 10})
            if resp:
                print(f"   idle-active = {resp.get('data')}")
            
            resp = mpv_request({"command": ["get_property", "pause"], "request_id": 11})
            if resp:
                print(f"   pause = {resp.get('data')}")
                
            resp = mpv_request({"command": ["get_property", "time-pos"], "request_id": 12})
            if resp:
                print(f"   time-pos = {resp.get('data')}")
                
            resp = mpv_request({"command": ["get_property", "duration"], "request_id": 13})
            if resp:
                print(f"   duration = {resp.get('data')}")
                
            resp = mpv_request({"command": ["get_property", "path"], "request_id": 14})
            if resp:
                print(f"   path = {resp.get('data')}")
    else:
        print("   ⚠️ 没有找到测试文件")
    
    print("\n" + "=" * 60)
    print("测试完成")

if __name__ == "__main__":
    main()
