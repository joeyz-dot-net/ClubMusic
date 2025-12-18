#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 /stream/play 端点，验证是否还有 tuple encode 错误
"""
import requests
import time
import sys

def test_stream_play():
    """测试 /stream/play 端点"""
    url = "http://localhost:80/stream/play"
    
    print("🧪 测试 /stream/play 端点...")
    print(f"连接到: {url}")
    
    try:
        # 使用流模式请求
        with requests.get(url, stream=True, timeout=10) as r:
            print(f"✓ 已连接，状态码: {r.status_code}")
            print(f"Content-Type: {r.headers.get('Content-Type', 'N/A')}")
            print(f"Transfer-Encoding: {r.headers.get('Transfer-Encoding', 'N/A')}")
            
            # 尝试读取前几个数据块
            bytes_read = 0
            chunk_count = 0
            start_time = time.time()
            
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    chunk_count += 1
                    bytes_read += len(chunk)
                    elapsed = time.time() - start_time
                    
                    print(f"  块 {chunk_count}: {len(chunk)} 字节 (总计: {bytes_read} 字节, 耗时: {elapsed:.2f}s)")
                    
                    # 读取 10 个块后停止
                    if chunk_count >= 10:
                        print(f"\n✓ 成功读取 {chunk_count} 个数据块，总计 {bytes_read} 字节")
                        print("✓ 没有发现 'tuple' object has no attribute 'encode' 错误")
                        return True
                    
                    # 超时保护
                    if elapsed > 30:
                        print(f"\n⚠️ 超时：{elapsed:.2f}s 没有完整读取 10 个块")
                        break
            
            if chunk_count >= 10:
                return True
            else:
                print(f"\n⚠️ 只读取了 {chunk_count} 个块")
                if bytes_read == 0:
                    print("⚠️ 没有收到任何数据")
                return False
                
    except requests.exceptions.ConnectionError as e:
        print(f"❌ 连接错误: {e}")
        print("❌ 服务器可能未运行。请确保在另一个终端运行 'python main.py'")
        return False
    except Exception as e:
        print(f"❌ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_stream_play()
    sys.exit(0 if success else 1)
