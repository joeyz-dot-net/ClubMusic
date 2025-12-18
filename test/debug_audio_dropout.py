#!/usr/bin/env python3
"""
诊断脚本：检查音频在1分钟后停止的原因

可能的原因：
1. FFmpeg进程停止或卡死
2. MPV管道通信中断
3. 网络缓冲区满导致广播失败
4. 客户端队列阻塞
5. stream_reader_thread遇到连续的空读取
"""

import sys
import os
import time
import json
import requests
import subprocess
import threading

# 配置
STATUS_CHECK_INTERVAL = 2  # 每2秒检查一次状态
MONITOR_DURATION = 120  # 监控2分钟
API_BASE = "http://127.0.0.1:80"

class StreamMonitor:
    def __init__(self):
        self.logs = []
        self.stream_status_history = []
        self.player_status_history = []
        self.last_chunks_read = 0
        self.last_total_bytes = 0
        
    def log(self, message):
        """记录日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {message}"
        self.logs.append(line)
        print(line)
    
    def get_stream_status(self):
        """获取流状态"""
        try:
            resp = requests.get(f"{API_BASE}/stream/status", timeout=5)
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                return {
                    "status": "OK",
                    "data": data
                }
            else:
                return {"status": "ERROR", "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}
    
    def get_player_status(self):
        """获取播放器状态"""
        try:
            resp = requests.get(f"{API_BASE}/status", timeout=5)
            if resp.status_code == 200:
                return resp.json()
            else:
                return {"status": "ERROR", "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}
    
    def check_ffmpeg_process(self):
        """检查FFmpeg进程是否运行"""
        try:
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq ffmpeg.exe"],
                capture_output=True,
                text=True
            )
            return "ffmpeg.exe" in result.stdout
        except:
            return False
    
    def check_mpv_process(self):
        """检查MPV进程是否运行"""
        try:
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq mpv.exe"],
                capture_output=True,
                text=True
            )
            return "mpv.exe" in result.stdout
        except:
            return False
    
    def analyze_stream_data(self, current, previous):
        """分析流数据的变化"""
        if not previous:
            return []
        
        issues = []
        
        # 检查chunks_read是否在增长
        curr_chunks = current.get("chunks_read", 0)
        prev_chunks = previous.get("chunks_read", 0)
        
        if curr_chunks == prev_chunks:
            issues.append("⚠️ chunks_read未增长 - 读取可能停止")
        
        # 检查total_bytes是否在增长
        curr_bytes = current.get("total_bytes", 0)
        prev_bytes = previous.get("total_bytes", 0)
        
        if curr_bytes == prev_bytes:
            issues.append("⚠️ total_bytes未增长 - 无新数据")
        
        # 检查广播失败数
        curr_fails = current.get("broadcast_fails", 0)
        prev_fails = previous.get("broadcast_fails", 0)
        
        if curr_fails > prev_fails:
            fail_diff = curr_fails - prev_fails
            issues.append(f"⚠️ 广播失败增长 (+{fail_diff})")
        
        # 检查活跃客户端
        curr_clients = current.get("active_clients", 0)
        prev_clients = previous.get("active_clients", 0)
        
        if curr_clients != prev_clients:
            issues.append(f"ℹ️ 活跃客户端变化: {prev_clients} → {curr_clients}")
        
        return issues
    
    def monitor_loop(self):
        """监控循环"""
        self.log("=" * 60)
        self.log("🔍 开始诊断音频停止问题")
        self.log("=" * 60)
        self.log(f"检查间隔: {STATUS_CHECK_INTERVAL}秒")
        self.log(f"监控时长: {MONITOR_DURATION}秒")
        self.log("")
        
        start_time = time.time()
        prev_stream_data = None
        
        while time.time() - start_time < MONITOR_DURATION:
            elapsed = int(time.time() - start_time)
            self.log(f"\n--- 时间: {elapsed}秒 ---")
            
            # 检查进程
            ffmpeg_running = self.check_ffmpeg_process()
            mpv_running = self.check_mpv_process()
            self.log(f"进程状态: FFmpeg={'✓' if ffmpeg_running else '✗'} MPV={'✓' if mpv_running else '✗'}")
            
            # 获取流状态
            stream_status = self.get_stream_status()
            if stream_status["status"] == "OK":
                data = stream_status["data"]
                self.stream_status_history.append(data)
                
                self.log(f"流状态: 活跃客户端={data.get('active_clients', '?')}, "
                        f"已读块数={data.get('chunks_read', '?')}, "
                        f"总字节={data.get('total_bytes', 0) / 1024 / 1024:.2f}MB")
                
                # 分析数据变化
                issues = self.analyze_stream_data(data, prev_stream_data)
                for issue in issues:
                    self.log(issue)
                
                prev_stream_data = data
            else:
                self.log(f"❌ 获取流状态失败: {stream_status.get('error', '未知错误')}")
            
            # 获取播放器状态
            player_status = self.get_player_status()
            if player_status.get("status") == "OK":
                data = player_status.get("data", {})
                self.player_status_history.append(data)
                
                paused = data.get("paused", "?")
                time_pos = data.get("time_pos", 0)
                duration = data.get("duration", 0)
                self.log(f"播放器: 暂停={'是' if paused else '否'}, "
                        f"位置={time_pos:.1f}s/{duration:.1f}s")
            else:
                self.log(f"❌ 获取播放器状态失败")
            
            time.sleep(STATUS_CHECK_INTERVAL)
        
        self.log("\n" + "=" * 60)
        self.log("📊 诊断完成")
        self.log("=" * 60)
        
        self.analyze_results()
    
    def analyze_results(self):
        """分析结果"""
        self.log("\n📈 数据分析：")
        
        if not self.stream_status_history:
            self.log("❌ 无流数据")
            return
        
        # 检查chunks_read的进度
        chunks_progression = [d.get("chunks_read", 0) for d in self.stream_status_history]
        self.log(f"\nchunks_read进度: {chunks_progression}")
        
        # 检查是否停止增长
        for i in range(1, len(chunks_progression)):
            if chunks_progression[i] == chunks_progression[i-1]:
                self.log(f"⚠️ 在数据点{i}处chunks_read停止增长")
        
        # 检查total_bytes
        bytes_progression = [d.get("total_bytes", 0) for d in self.stream_status_history]
        self.log(f"\ntotal_bytes进度(MB): {[f'{b/1024/1024:.2f}' for b in bytes_progression]}")
        
        # 检查客户端数变化
        clients_progression = [d.get("active_clients", 0) for d in self.stream_status_history]
        self.log(f"\nactive_clients进度: {clients_progression}")
        
        if any(c == 0 for c in clients_progression):
            self.log("⚠️ 发现有数据点的客户端数为0")
        
        # 检查播放位置
        if self.player_status_history:
            positions = [d.get("data", {}).get("time_pos", 0) for d in self.player_status_history]
            self.log(f"\n播放位置进度(秒): {positions}")
            
            # 检查是否停止进展
            for i in range(1, len(positions)):
                if abs(positions[i] - positions[i-1]) < 0.1:
                    # 没有显著进展
                    pass
                else:
                    # 进展正常
                    pass
        
        # 建议
        self.log("\n💡 建议检查项：")
        self.log("1. FFmpeg缓冲区设置 (rtbufsize, bufsize)")
        self.log("2. 客户端队列大小限制")
        self.log("3. stream_reader_thread是否遇到连续空读")
        self.log("4. MPV管道通信是否中断")
        self.log("5. 系统资源是否充足")

if __name__ == "__main__":
    monitor = StreamMonitor()
    try:
        monitor.monitor_loop()
    except KeyboardInterrupt:
        monitor.log("\n⏹️ 监控中断")
    except Exception as e:
        monitor.log(f"\n❌ 异常: {e}")
        import traceback
        traceback.print_exc()
    
    # 保存日志
    log_file = "audio_dropout_debug.log"
    with open(log_file, "w", encoding="utf-8") as f:
        f.write("\n".join(monitor.logs))
    print(f"\n✅ 日志已保存到 {log_file}")
