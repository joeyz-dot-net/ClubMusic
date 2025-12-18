#!/usr/bin/env python3
"""
测试幽灵客户端问题：两个浏览器，但显示 3 个活跃客户端
"""
import asyncio
import aiohttp
import time
import sys

async def test_dual_client():
    """测试双客户端场景"""
    
    base_url = "http://127.0.0.1:80"
    
    # 创建两个会话
    async with aiohttp.ClientSession() as session1, \
               aiohttp.ClientSession() as session2:
        
        print("[TEST] 启动双客户端测试...")
        print(f"[TEST] 客户端1开始流式传输...")
        
        # 启动客户端1
        start_time = time.time()
        task1 = asyncio.create_task(
            test_single_client(session1, "client1", base_url)
        )
        
        await asyncio.sleep(1)
        
        print(f"[TEST] 客户端2开始流式传输...")
        task2 = asyncio.create_task(
            test_single_client(session2, "client2", base_url)
        )
        
        # 监控状态
        monitoring_task = asyncio.create_task(
            monitor_status(base_url, start_time)
        )
        
        # 等待所有客户端完成或超时
        try:
            await asyncio.wait_for(
                asyncio.gather(task1, task2, monitoring_task),
                timeout=300  # 5 分钟超时
            )
        except asyncio.TimeoutError:
            print("[TEST] ⏱️ 5 分钟测试完成")
            task1.cancel()
            task2.cancel()
            monitoring_task.cancel()
            

async def test_single_client(session, client_id, base_url):
    """测试单个客户端"""
    url = f"{base_url}/stream/play?format=aac&t={int(time.time()*1000)}"
    
    try:
        async with session.get(url) as resp:
            if resp.status == 200:
                print(f"[{client_id}] ✓ 连接建立 (状态码: {resp.status})")
                
                start_time = time.time()
                bytes_received = 0
                chunks = 0
                
                async for chunk in resp.content.iter_chunked(8192):
                    bytes_received += len(chunk)
                    chunks += 1
                    
                    elapsed = time.time() - start_time
                    
                    # 每 10 秒打印进度
                    if chunks % 100 == 0:
                        rate = bytes_received / elapsed if elapsed > 0 else 0
                        print(f"[{client_id}] 已接收 {bytes_received/1024:.1f}KB ({chunks}块), "
                              f"耗时 {elapsed:.1f}s, 速率 {rate/1024:.1f}KB/s")
                    
                    # 测试 120 秒
                    if elapsed > 120:
                        break
                
                total_time = time.time() - start_time
                rate = bytes_received / total_time if total_time > 0 else 0
                print(f"[{client_id}] ✅ 测试完成: {bytes_received/1024:.1f}KB, "
                      f"{total_time:.1f}s, {rate/1024:.1f}KB/s")
            else:
                print(f"[{client_id}] ❌ 连接失败 (状态码: {resp.status})")
    except asyncio.CancelledError:
        print(f"[{client_id}] ⏹️ 已取消")
        raise
    except Exception as e:
        print(f"[{client_id}] ❌ 错误: {e}")


async def monitor_status(base_url, start_time):
    """监控服务器状态"""
    
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(f"{base_url}/stream/status") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        elapsed = time.time() - start_time
                        
                        active = data.get("data", {}).get("active_clients", 0)
                        peak = data.get("data", {}).get("peak_concurrent", 0)
                        total = data.get("data", {}).get("total_clients_ever", 0)
                        
                        print(f"[STATUS] [{elapsed:6.1f}s] 当前活跃: {active}, "
                              f"峰值: {peak}, 总计: {total}")
                        
                        # 检查幽灵客户端
                        if active > 2:
                            print(f"[ALERT] ⚠️ 检测到可能的幽灵客户端! "
                                  f"活跃客户端: {active} (期望: 0-2)")
                
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[STATUS] 错误: {e}")
                await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(test_dual_client())
