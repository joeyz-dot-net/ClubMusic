#!/usr/bin/env python3
"""
简单的推流长时间测试脚本
监控是否在 2-5 分钟后仍然有数据流动
"""

import requests
import time
import json

API_URL = "http://127.0.0.1:80"

def get_stream_status():
    """获取流状态"""
    try:
        resp = requests.get(f"{API_URL}/stream/status", timeout=5)
        if resp.status_code == 200:
            return resp.json().get("data", {})
    except:
        pass
    return None

def monitor_stream(duration=300):  # 默认监控 5 分钟
    """监控推流状态"""
    print(f"🔍 开始监控推流 ({duration}秒)...\n")
    
    start_time = time.time()
    last_chunks = 0
    last_bytes = 0
    
    while time.time() - start_time < duration:
        elapsed = int(time.time() - start_time)
        status = get_stream_status()
        
        if status:
            chunks = status.get("chunks_read", 0)
            total_bytes = status.get("total_bytes", 0)
            active_clients = status.get("active_clients", 0)
            
            # 计算增长
            chunks_delta = chunks - last_chunks
            bytes_delta = total_bytes - last_bytes
            
            print(f"[{elapsed:3d}s] 块数: {chunks_delta:4d} ({chunks:7d}总) | "
                  f"数据: {bytes_delta/1024/1024:6.2f}MB ({total_bytes/1024/1024:8.2f}MB总) | "
                  f"客户端: {active_clients}")
            
            # 检查是否停止
            if chunks_delta == 0 and bytes_delta == 0 and active_clients == 0:
                print(f"\n⚠️ 警告: 在 {elapsed}s 时数据停止增长且无客户端")
            
            last_chunks = chunks
            last_bytes = total_bytes
        else:
            print(f"[{elapsed:3d}s] ❌ 无法获取流状态")
        
        time.sleep(2)
    
    print(f"\n✅ 监控完成 ({duration}秒)")
    
    # 最终统计
    final_status = get_stream_status()
    if final_status:
        print(f"\n📊 最终统计:")
        print(f"  总块数: {final_status.get('chunks_read', 0)}")
        print(f"  总数据: {final_status.get('total_bytes', 0) / 1024 / 1024:.2f} MB")
        print(f"  活跃客户端: {final_status.get('active_clients', 0)}")

if __name__ == "__main__":
    import sys
    
    duration = 300  # 默认 5 分钟
    if len(sys.argv) > 1:
        try:
            duration = int(sys.argv[1])
        except:
            pass
    
    monitor_stream(duration)
