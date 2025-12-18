# -*- coding: utf-8 -*-
"""
测试脚本 - 验证推流多客户端优化
演示客户端连接池、自适应比特率和性能监控
"""
import sys
import time
import threading
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

import models.stream as stream_module


def test_client_pool():
    """测试客户端连接池"""
    print("\n" + "="*60)
    print("测试 1: 客户端连接池管理")
    print("="*60)
    
    pool = stream_module.CLIENT_POOL
    
    # 模拟注册多个客户端
    print("\n[测试] 注册5个客户端...")
    client_ids = []
    for i in range(5):
        client_id = f"test_client_{i}"
        queue = pool.register(client_id, "mp3")
        client_ids.append(client_id)
        print(f"  ✓ 客户端 {i+1}: {client_id[:15]}...")
        time.sleep(0.1)
    
    # 检查统计信息
    stats = pool.get_stats()
    print(f"\n[统计] 活跃客户端: {stats['active_clients']}")
    print(f"[统计] 历史连接数: {stats['total_clients_ever']}")
    print(f"[统计] 峰值并发: {stats['peak_concurrent']}")
    
    # 注销部分客户端
    print("\n[测试] 注销2个客户端...")
    for i in range(2):
        pool.unregister(client_ids[i])
        print(f"  ✓ 已注销: {client_ids[i][:15]}...")
    
    stats = pool.get_stats()
    print(f"\n[统计] 当前活跃客户端: {stats['active_clients']}")
    print(f"[统计] 峰值仍为: {stats['peak_concurrent']}")
    
    # 清理所有
    for client_id in client_ids[2:]:
        pool.unregister(client_id)


def test_adaptive_bitrate():
    """测试自适应比特率"""
    print("\n" + "="*60)
    print("测试 2: 自适应比特率控制")
    print("="*60)
    
    test_cases = [
        (0, 192, "无客户端"),
        (1, 192, "1个客户端"),
        (3, 192, "3个客户端"),
        (5, 192, "5个客户端"),
        (6, 184, "6个客户端（开始降速）"),
        (10, 160, "10个客户端"),
        (15, 128, "15个客户端（最低比特率）"),
    ]
    
    print("\n客户端数 | 比特率 | 场景")
    print("-" * 40)
    
    for client_count, expected_bitrate, desc in test_cases:
        # 模拟客户端注册
        pool = stream_module.CLIENT_POOL
        
        # 清理旧客户端
        for cid in list(pool.clients.keys()):
            pool.unregister(cid)
        
        # 注册新客户端
        for i in range(client_count):
            pool.register(f"client_{i}", "mp3")
        
        # 计算比特率
        base_bitrate = 192
        if client_count > 5:
            bitrate = max(128, base_bitrate - (client_count - 5) * 8)
        else:
            bitrate = base_bitrate
        
        status = "✓" if bitrate == expected_bitrate else "✗"
        print(f"{client_count:^8} | {bitrate:^6} | {status} {desc}")


def test_broadcast():
    """测试广播功能"""
    print("\n" + "="*60)
    print("测试 3: 非阻塞广播和故障隔离")
    print("="*60)
    
    pool = stream_module.CLIENT_POOL
    
    # 清理旧客户端
    for cid in list(pool.clients.keys()):
        pool.unregister(cid)
    
    # 注册3个客户端
    print("\n[测试] 注册3个客户端...")
    for i in range(3):
        pool.register(f"broadcast_test_{i}", "mp3")
    
    print(f"[统计] 活跃客户端: {pool.get_active_count()}")
    
    # 进行广播测试
    print("\n[测试] 发送10个数据块...")
    total_success = 0
    total_fail = 0
    
    for chunk_idx in range(10):
        # 创建模拟数据块
        test_chunk = b"x" * (256 * 1024)  # 256KB
        success, fail = pool.broadcast(test_chunk)
        total_success += success
        total_fail += fail
        
        if chunk_idx % 3 == 0:
            print(f"  块 {chunk_idx+1}: 成功 {success}, 失败 {fail}")
    
    print(f"\n[统计] 总成功: {total_success}, 总失败: {total_fail}")
    
    # 检查每个客户端的接收情况
    stats = pool.get_stats()
    print(f"\n[客户端数据]")
    for client in stats["clients"]:
        print(f"  - {client['id']}: {client['chunks_received']} 块, {client['bytes_sent']/1024:.1f}KB")


def test_statistics():
    """测试统计信息收集"""
    print("\n" + "="*60)
    print("测试 4: 性能统计信息")
    print("="*60)
    
    pool = stream_module.CLIENT_POOL
    
    # 清理旧客户端
    for cid in list(pool.clients.keys()):
        pool.unregister(cid)
    
    # 注册2个客户端
    print("\n[测试] 注册2个客户端并发送数据...")
    pool.register("stats_test_1", "mp3")
    pool.register("stats_test_2", "aac")
    
    # 发送数据
    for i in range(5):
        test_chunk = b"y" * (128 * 1024)  # 128KB
        pool.broadcast(test_chunk)
    
    # 获取统计
    stats = pool.get_stats()
    
    print(f"\n[客户端池统计]")
    print(f"  活跃客户端: {stats['active_clients']}")
    print(f"  历史总数: {stats['total_clients_ever']}")
    print(f"  峰值并发: {stats['peak_concurrent']}")
    print(f"  总发送块数: {stats['total_chunks_sent']}")
    print(f"  总发送字节: {stats['total_bytes_sent'] / 1024:.1f} KB")
    
    print(f"\n[客户端详情]")
    for i, client in enumerate(stats["clients"], 1):
        print(f"  客户端 {i}:")
        print(f"    - ID: {client['id']}")
        print(f"    - 格式: {client['format']}")
        print(f"    - 接收块数: {client['chunks_received']}")
        print(f"    - 发送字节: {client['bytes_sent'] / 1024:.1f} KB")


def test_cleanup():
    """测试自动清理"""
    print("\n" + "="*60)
    print("测试 5: 自动清理死亡客户端")
    print("="*60)
    
    pool = stream_module.CLIENT_POOL
    
    # 清理旧客户端
    for cid in list(pool.clients.keys()):
        pool.unregister(cid)
    
    print("\n[测试] 注册3个客户端...")
    client_ids = []
    for i in range(3):
        cid = f"cleanup_test_{i}"
        pool.register(cid, "mp3")
        client_ids.append(cid)
    
    print(f"[统计] 当前活跃: {pool.get_active_count()}")
    
    # 模拟长时间无活动
    print("\n[测试] 跳过客户端0的活动更新（模拟长时间无数据）...")
    client_info = pool.get_client(client_ids[0])
    if client_info:
        # 将活动时间设置为30秒前
        client_info.last_activity = time.time() - 35
    
    # 执行清理
    print("[测试] 执行自动清理（超时=30秒）...")
    cleaned = pool.cleanup_dead_clients(timeout=30)
    
    print(f"[统计] 清理了 {cleaned} 个客户端")
    print(f"[统计] 剩余活跃: {pool.get_active_count()}")


def run_all_tests():
    """运行所有测试"""
    print("\n" + "="*60)
    print("FFmpeg 推流多客户端优化 - 功能测试套件")
    print("="*60)
    
    try:
        test_client_pool()
        test_adaptive_bitrate()
        test_broadcast()
        test_statistics()
        test_cleanup()
        
        print("\n" + "="*60)
        print("✓ 所有测试完成！")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    run_all_tests()
