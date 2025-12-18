# -*- coding: utf-8 -*-
"""
测试多浏览器客户端场景
验证第二个浏览器连接时，第一个浏览器不会停止播放
"""
import sys
import time
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import models.stream as stream_module


def test_multi_client_scenario():
    """
    测试场景：
    1. 启动第一个客户端 (mp3格式)
    2. 等待1秒
    3. 启动第二个客户端 (mp3格式)
    4. 验证第一个客户端仍然保持连接
    """
    print("\n" + "="*70)
    print("测试场景: 多浏览器客户端连接（不中断已有连接）")
    print("="*70)
    
    pool = stream_module.CLIENT_POOL
    
    # 清理旧客户端
    for cid in list(pool.clients.keys()):
        pool.unregister(cid)
    
    print("\n[第一阶段] 第一个浏览器连接...")
    print("  └─ 调用 start_ffmpeg_stream(format='mp3')")
    
    # 模拟第一个浏览器连接
    client1_id = "browser_1_mp3"
    result1 = stream_module.start_ffmpeg_stream(audio_format="mp3")
    print(f"  └─ FFmpeg启动结果: {result1}")
    print(f"  └─ 当前格式: {stream_module.FFMPEG_FORMAT}")
    
    client1_queue = stream_module.register_client(client1_id)
    print(f"  └─ 客户端1已注册: {client1_id}")
    
    stats = pool.get_stats()
    print(f"  └─ 活跃客户端数: {stats['active_clients']}")
    
    # 模拟接收数据
    print("\n[第一阶段后期] 第一个客户端接收数据...")
    test_chunk = b"x" * (128 * 1024)
    success, fail = pool.broadcast(test_chunk)
    print(f"  └─ 广播数据块: 成功{success}, 失败{fail}")
    print(f"  └─ 客户端1队列中数据: {client1_queue.qsize()} 块")
    
    print("\n[等待1秒...]")
    time.sleep(1)
    
    print("\n[第二阶段] 第二个浏览器连接（使用相同格式mp3）...")
    print("  └─ 调用 start_ffmpeg_stream(format='mp3')")
    
    # 模拟第二个浏览器连接
    client2_id = "browser_2_mp3"
    result2 = stream_module.start_ffmpeg_stream(audio_format="mp3")
    print(f"  └─ FFmpeg启动结果: {result2}")
    print(f"  └─ 当前格式: {stream_module.FFMPEG_FORMAT}")
    
    # 检查第一个客户端是否仍然存在
    client1_info = pool.get_client(client1_id)
    if client1_info is None:
        print(f"  ✗ 错误! 客户端1已被移除!")
        return False
    else:
        print(f"  ✓ 客户端1仍然存活: {client1_id}")
    
    client2_queue = stream_module.register_client(client2_id)
    print(f"  └─ 客户端2已注册: {client2_id}")
    
    stats = pool.get_stats()
    print(f"  └─ 活跃客户端数: {stats['active_clients']}")
    
    # 广播更多数据
    print("\n[第二阶段后期] 继续广播数据给两个客户端...")
    for i in range(3):
        success, fail = pool.broadcast(test_chunk)
        print(f"  └─ 广播块{i+1}: 成功{success}, 失败{fail}")
    
    print(f"  └─ 客户端1队列中数据: {client1_queue.qsize()} 块")
    print(f"  └─ 客户端2队列中数据: {client2_queue.qsize()} 块")
    
    # 验证两个客户端都有数据
    if client1_queue.qsize() > 0 and client2_queue.qsize() > 0:
        print("\n✅ 成功! 两个客户端都收到了数据，第一个客户端未被中断!")
        return True
    else:
        print(f"\n❌ 失败! 客户端1数据: {client1_queue.qsize()}, 客户端2数据: {client2_queue.qsize()}")
        return False


def test_different_format_scenario():
    """
    测试场景：
    1. 启动第一个客户端 (mp3格式)
    2. 启动第二个客户端 (aac格式) - 应该不更换格式
    3. 验证流仍然是mp3格式
    """
    print("\n" + "="*70)
    print("测试场景: 不同格式的客户端连接（应保持已有格式）")
    print("="*70)
    
    pool = stream_module.CLIENT_POOL
    
    # 清理旧客户端
    for cid in list(pool.clients.keys()):
        pool.unregister(cid)
    
    print("\n[第一步] 第一个客户端请求mp3格式...")
    client1_id = "browser_1_mp3"
    result1 = stream_module.start_ffmpeg_stream(audio_format="mp3")
    stream_module.register_client(client1_id)
    format_after_client1 = stream_module.FFMPEG_FORMAT
    print(f"  └─ 流格式: {format_after_client1}")
    
    print("\n[第二步] 第二个客户端请求aac格式...")
    client2_id = "browser_2_aac"
    result2 = stream_module.start_ffmpeg_stream(audio_format="aac")
    stream_module.register_client(client2_id)
    format_after_client2 = stream_module.FFMPEG_FORMAT
    print(f"  └─ 流格式: {format_after_client2}")
    
    stats = pool.get_stats()
    print(f"  └─ 活跃客户端数: {stats['active_clients']}")
    
    # 验证格式未更改
    if format_after_client2 == "mp3":
        print("\n✅ 成功! 流格式保持为mp3，未因为新客户端请求而改变!")
        return True
    else:
        print(f"\n❌ 失败! 流格式被改为{format_after_client2}，中断了既有客户端!")
        return False


if __name__ == "__main__":
    try:
        test1_passed = test_multi_client_scenario()
        test2_passed = test_different_format_scenario()
        
        print("\n" + "="*70)
        print("测试总结")
        print("="*70)
        print(f"测试1 (相同格式): {'✅ PASS' if test1_passed else '❌ FAIL'}")
        print(f"测试2 (不同格式): {'✅ PASS' if test2_passed else '❌ FAIL'}")
        
        if test1_passed and test2_passed:
            print("\n🎉 所有测试通过! 多客户端连接时不会中断现有连接。")
        else:
            print("\n⚠️ 部分测试失败，请检查修复。")
            
    except Exception as e:
        print(f"\n✗ 测试异常: {e}")
        import traceback
        traceback.print_exc()
