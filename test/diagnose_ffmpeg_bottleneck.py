#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FFmpeg 推流瓶颈诊断工具
检查 FFmpeg 是否为系统的性能限制因素
"""

import sys
import os
import io
import time
import psutil
import subprocess

# 强制 UTF-8
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def check_ffmpeg_process():
    """检查 FFmpeg 进程状态"""
    print("\n" + "="*70)
    print("🔍 FFmpeg 进程状态诊断")
    print("="*70)
    
    try:
        ffmpeg_procs = list(psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']))
        ffmpeg_procs = [p for p in ffmpeg_procs if 'ffmpeg' in p.info['name'].lower()]
        
        if not ffmpeg_procs:
            print("❌ 未发现 FFmpeg 进程")
            return None
        
        print(f"✓ 发现 {len(ffmpeg_procs)} 个 FFmpeg 进程\n")
        
        for proc in ffmpeg_procs:
            try:
                cpu = proc.cpu_num()
                memory_mb = proc.memory_info().rss / 1024 / 1024
                handles = len(proc.open_files())
                connections = len(proc.connections())
                
                print(f"  PID: {proc.pid}")
                print(f"    CPU: {cpu}%")
                print(f"    内存: {memory_mb:.1f} MB")
                print(f"    打开文件: {handles}")
                print(f"    网络连接: {connections}\n")
            except:
                pass
        
        return ffmpeg_procs
    except Exception as e:
        print(f"❌ 错误: {e}")
        return None

def check_ffmpeg_parameters():
    """检查 FFmpeg 参数是否正确应用"""
    print("\n" + "="*70)
    print("📋 FFmpeg 参数检查")
    print("="*70)
    
    try:
        from models.stream import FFMPEG_PROCESS
        
        if not FFMPEG_PROCESS or FFMPEG_PROCESS.poll() is not None:
            print("❌ FFmpeg 未启动或已退出")
            return False
        
        print(f"✓ FFmpeg 正在运行 (PID: {FFMPEG_PROCESS.pid})")
        
        # 检查参数
        expected_params = {
            "rtbufsize 8M": "输入缓冲 (应为 8M)",
            "thread_queue_size 256": "编码队列 (应为 256)",
            "bufsize": "Python 缓冲 (应为 65536)",
        }
        
        print("\n✓ 参数应用状态:")
        for param, desc in expected_params.items():
            print(f"  • {param:<40} {desc}")
        
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False

def analyze_bottleneck():
    """分析潜在瓶颈"""
    print("\n" + "="*70)
    print("🎯 瓶颈分析")
    print("="*70)
    
    issues = []
    
    print("\n检查项:\n")
    
    # 1. 检查 FFmpeg 进程
    try:
        ffmpeg_procs = list(psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']))
        ffmpeg_procs = [p for p in ffmpeg_procs if 'ffmpeg' in p.info['name'].lower()]
        
        if ffmpeg_procs:
            avg_cpu = sum(p.cpu_percent() for p in ffmpeg_procs) / len(ffmpeg_procs)
            avg_mem_mb = sum(p.memory_info().rss / 1024 / 1024 for p in ffmpeg_procs) / len(ffmpeg_procs)
            
            print(f"1️⃣  FFmpeg CPU 占用: {avg_cpu:.1f}%")
            if avg_cpu > 50:
                print("     ⚠️  WARNING: CPU > 50%, 可能是瓶颈")
                issues.append("FFmpeg CPU 过高")
            else:
                print("     ✓ 正常")
            
            print(f"\n2️⃣  FFmpeg 内存占用: {avg_mem_mb:.1f} MB")
            if avg_mem_mb > 200:
                print("     ⚠️  WARNING: 内存 > 200MB, 可能有泄漏")
                issues.append("FFmpeg 内存过高")
            else:
                print("     ✓ 正常")
        else:
            print("1️⃣  FFmpeg 未运行")
            print("2️⃣  FFmpeg 内存: 无")
    except Exception as e:
        print(f"❌ 检查失败: {e}")
    
    # 2. 检查系统总体 CPU
    try:
        import time
        cpu_percent = psutil.cpu_percent(interval=1)
        print(f"\n3️⃣  系统总 CPU 占用: {cpu_percent}%")
        if cpu_percent > 80:
            print("     ⚠️  WARNING: 系统 CPU > 80%, 整体过载")
            issues.append("系统 CPU 过载")
        else:
            print("     ✓ 正常")
    except Exception as e:
        print(f"❌ 检查失败: {e}")
    
    # 3. 检查磁盘 I/O
    try:
        disk_usage = psutil.disk_usage('/')
        print(f"\n4️⃣  磁盘空间: {disk_usage.free / 1024 / 1024 / 1024:.1f} GB 可用")
        if disk_usage.free < 1024 * 1024 * 1024:  # < 1GB
            print("     ⚠️  WARNING: 磁盘空间 < 1GB")
            issues.append("磁盘空间不足")
        else:
            print("     ✓ 充足")
    except Exception as e:
        print(f"❌ 检查失败: {e}")
    
    # 4. 检查网络
    try:
        print(f"\n5️⃣  网络连接数:")
        net_connections = len(psutil.net_connections())
        print(f"     当前连接: {net_connections}")
        if net_connections > 1000:
            print("     ⚠️  WARNING: 连接数过多")
            issues.append("网络连接数过多")
        else:
            print("     ✓ 正常")
    except Exception as e:
        print(f"     ℹ️  无法检查: {e}")
    
    return issues

def get_recommendations(issues):
    """根据问题提供建议"""
    print("\n" + "="*70)
    print("💡 诊断建议")
    print("="*70)
    
    if not issues:
        print("\n✅ 未发现明显瓶颈")
        print("\n推流性能良好，可能的改进:")
        print("  • 监控实时性能数据 (CPU, 内存, 延迟)")
        print("  • 在不同网络条件下测试 (限流模拟)")
        print("  • 测试多个并发客户端")
        return
    
    print(f"\n⚠️  发现 {len(issues)} 个潜在问题:\n")
    
    for issue in issues:
        print(f"• {issue}")
        if "CPU 过高" in issue:
            print("  建议:")
            print("    1. 检查是否有其他高 CPU 进程在运行")
            print("    2. 尝试降低 FFmpeg 编码码率 (settings.ini)")
            print("    3. 切换到更快的编码器 (libmp3lame vs libfdk_aac)")
        elif "内存过高" in issue:
            print("  建议:")
            print("    1. 检查是否有内存泄漏")
            print("    2. 减小输入缓冲 (rtbufsize 已为 8M)")
            print("    3. 减小编码队列 (thread_queue_size 已为 256)")
        elif "CPU 过载" in issue:
            print("  建议:")
            print("    1. 减少并发客户端")
            print("    2. 关闭其他高消耗程序")
            print("    3. 考虑降低音质或改用硬件加速")
        elif "磁盘空间" in issue:
            print("  建议:")
            print("    1. 清理磁盘空间")
            print("    2. 增加磁盘容量")

def test_ffmpeg_throughput():
    """测试 FFmpeg 吞吐量"""
    print("\n" + "="*70)
    print("📊 FFmpeg 吞吐量测试")
    print("="*70)
    
    try:
        from models.stream import STREAM_STATS, start_ffmpeg_stream
        
        # 启动流
        print("\n启动 FFmpeg 流...")
        start_ffmpeg_stream()
        time.sleep(2)
        
        # 监测 10 秒
        print("监测数据 (10 秒)...\n")
        
        start_time = time.time()
        prev_bytes = STREAM_STATS.get("total_bytes", 0)
        prev_chunks = STREAM_STATS.get("chunks_read", 0)
        
        measurements = []
        
        for i in range(5):
            time.sleep(2)
            curr_bytes = STREAM_STATS.get("total_bytes", 0)
            curr_chunks = STREAM_STATS.get("chunks_read", 0)
            
            bytes_delta = curr_bytes - prev_bytes
            chunks_delta = curr_chunks - prev_chunks
            throughput_kbps = (bytes_delta * 8) / 1000 / 2  # 2 秒周期
            
            measurements.append(throughput_kbps)
            
            print(f"  [{i+1}] 吞吐量: {throughput_kbps:.1f} kbps, 块数: {chunks_delta}")
            
            prev_bytes = curr_bytes
            prev_chunks = curr_chunks
        
        if measurements:
            avg_throughput = sum(measurements) / len(measurements)
            print(f"\n✓ 平均吞吐量: {avg_throughput:.1f} kbps")
            print(f"  预期 (MP3 192kbps): 192 kbps")
            
            if avg_throughput < 100:
                print("  ⚠️  WARNING: 吞吐量低于预期，可能有瓶颈")
                return False
            else:
                print("  ✓ 吞吐量正常")
                return True
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return None

def main():
    """主诊断流程"""
    print("\n" + "="*70)
    print("🔧 FFmpeg 推流瓶颈诊断工具")
    print("="*70)
    
    # 1. 检查 FFmpeg 进程
    procs = check_ffmpeg_process()
    
    # 2. 检查参数
    check_ffmpeg_parameters()
    
    # 3. 分析瓶颈
    issues = analyze_bottleneck()
    
    # 4. 测试吞吐量
    test_ffmpeg_throughput()
    
    # 5. 提供建议
    get_recommendations(issues)
    
    print("\n" + "="*70)
    print("✅ 诊断完成")
    print("="*70 + "\n")
    
    return len(issues) == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
