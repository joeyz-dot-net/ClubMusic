"""测试 /status API 返回的播放状态"""
import requests
import json
import time

def main():
    print("=" * 60)
    print("测试 /status API")
    print("=" * 60)
    
    # 1. 检查初始状态
    print("\n1. 初始状态:")
    try:
        resp = requests.get("http://localhost/status", timeout=5)
        data = resp.json()
        print(f"   status: {data.get('status')}")
        print(f"   current_meta: {json.dumps(data.get('current_meta', {}), ensure_ascii=False, indent=6)[:200]}...")
        
        mpv_state = data.get("mpv_state", {})
        print(f"   mpv_state:")
        print(f"     paused: {mpv_state.get('paused')}")
        print(f"     time_pos: {mpv_state.get('time_pos')}")
        print(f"     duration: {mpv_state.get('duration')}")
        print(f"     volume: {mpv_state.get('volume')}")
    except Exception as e:
        print(f"   错误: {e}")
    
    # 2. 播放一个文件
    print("\n2. 尝试播放文件...")
    try:
        # 使用 form data 播放
        data = {
            "url": "Z:/Black Myth - Wukong FLAC/01. I See.flac",
            "title": "I See",
            "type": "local"
        }
        resp = requests.post("http://localhost/play", data=data, timeout=10)
        result = resp.json()
        print(f"   播放响应: {json.dumps(result, ensure_ascii=False)}")
    except Exception as e:
        print(f"   错误: {e}")
    
    # 3. 等待并再次检查状态
    print("\n3. 等待2秒后检查状态...")
    time.sleep(2)
    
    try:
        resp = requests.get("http://localhost/status", timeout=5)
        data = resp.json()
        
        mpv_state = data.get("mpv_state", {})
        print(f"   mpv_state:")
        print(f"     paused: {mpv_state.get('paused')}")
        print(f"     time_pos: {mpv_state.get('time_pos')}")
        print(f"     duration: {mpv_state.get('duration')}")
        print(f"     volume: {mpv_state.get('volume')}")
        
        if mpv_state.get('time_pos') is not None and mpv_state.get('duration') is not None:
            print(f"\n   ✅ 播放进度正常！")
            progress = (mpv_state.get('time_pos') / mpv_state.get('duration')) * 100
            print(f"   进度: {progress:.1f}%")
        else:
            print(f"\n   ❌ 播放进度异常！time_pos 或 duration 为 None")
    except Exception as e:
        print(f"   错误: {e}")
    
    # 4. 多次检查确认进度在更新
    print("\n4. 验证进度正在更新...")
    positions = []
    for i in range(3):
        time.sleep(1)
        try:
            resp = requests.get("http://localhost/status", timeout=5)
            data = resp.json()
            pos = data.get("mpv_state", {}).get("time_pos")
            positions.append(pos)
            print(f"   [{i+1}秒] time_pos = {pos}")
        except:
            pass
    
    if len(positions) == 3:
        if positions[2] and positions[0] and positions[2] > positions[0]:
            print(f"\n   ✅ 进度正在更新！从 {positions[0]:.2f} 到 {positions[2]:.2f}")
        else:
            print(f"\n   ❌ 进度未更新！values = {positions}")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
