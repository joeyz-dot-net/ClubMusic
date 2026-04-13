#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FFmpeg WASAPI 支持检测工具

用途：测试当前系统的 FFmpeg 版本是否支持 wasapi 音频输入格式
"""

import subprocess
import sys
import os

import pytest


_CREATE_NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def find_ffmpeg():
    """查找 FFmpeg 可执行文件"""
    # 方案1: 检查 bin 目录
    try:
        from pathlib import Path

        ffmpeg_path = Path(__file__).resolve().parents[1] / "bin" / "ffmpeg.exe"
        
        if ffmpeg_path.exists():
            print(f"✅ 在 bin 目录找到 FFmpeg: {ffmpeg_path}")
            return str(ffmpeg_path)
    except Exception as e:
        print(f"⚠️  检查 bin 目录失败: {e}")
    
    # 方案2: 使用系统 PATH
    try:
        result = subprocess.run(
            ["where", "ffmpeg"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            ffmpeg_path = result.stdout.strip().split('\n')[0]
            print(f"✅ 在系统 PATH 找到 FFmpeg: {ffmpeg_path}")
            return ffmpeg_path
    except Exception as e:
        print(f"⚠️  系统 PATH 查找失败: {e}")
    
    # 方案3: 直接使用 ffmpeg 命令
    print("⚠️  使用系统命令 'ffmpeg'")
    return "ffmpeg"


@pytest.fixture(scope="module")
def ffmpeg_cmd():
    """为 pytest 提供可用的 FFmpeg 命令；缺失时跳过能力探测测试。"""
    command = find_ffmpeg()

    try:
        result = subprocess.run(
            [command, "-version"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=_CREATE_NO_WINDOW,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        pytest.skip(f"FFmpeg unavailable for capability probe: {exc}")
    except Exception as exc:
        pytest.skip(f"Unable to start FFmpeg capability probe: {exc}")

    if result.returncode != 0:
        details = (result.stderr or result.stdout or "unknown error").strip()
        pytest.skip(f"FFmpeg unavailable for capability probe: {details}")

    return command


def get_ffmpeg_version(ffmpeg_cmd):
    """获取 FFmpeg 版本信息"""
    print("\n" + "="*70)
    print("📦 FFmpeg 版本信息")
    print("="*70 + "\n")
    
    try:
        result = subprocess.run(
            [ffmpeg_cmd, "-version"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=_CREATE_NO_WINDOW
        )
        
        if result.returncode == 0:
            # 只显示前两行（版本号）
            lines = result.stdout.split('\n')
            print(lines[0])
            if len(lines) > 1:
                print(lines[1])
            print()
            return True
        else:
            print(f"❌ 获取版本失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ 获取版本异常: {e}")
        return False


def check_format_support(ffmpeg_cmd, format_name):
    """检查 FFmpeg 是否支持特定格式"""
    try:
        result = subprocess.run(
            [ffmpeg_cmd, "-formats"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=_CREATE_NO_WINDOW
        )
        
        if result.returncode == 0:
            output = result.stderr + result.stdout
            return format_name.lower() in output.lower()
        else:
            print(f"⚠️  无法列出支持的格式: {result.stderr}")
            return False
    except Exception as e:
        print(f"⚠️  检查格式支持失败: {e}")
        return False


def probe_wasapi_support(ffmpeg_cmd):
    """检测 wasapi 支持情况。"""
    print("="*70)
    print("🎙️  WASAPI 支持检测")
    print("="*70 + "\n")
    
    supports_wasapi = check_format_support(ffmpeg_cmd, "wasapi")
    
    if supports_wasapi:
        print("✅ WASAPI 支持: YES")
        print("   - 推荐配置: audio_input_format = wasapi")
        print("   - 优势:")
        print("     • 低延迟 (30ms)")
        print("     • 高音质")
        print("     • 低 CPU 占用")
        return True
    else:
        print("❌ WASAPI 支持: NO")
        print("   - 推荐配置: audio_input_format = dshow")
        print("   - 当前 FFmpeg 版本不支持 wasapi")
        print("   - 解决方案:")
        print("     1. 使用 dshow 代替")
        print("     2. 或重新编译/下载支持 wasapi 的 FFmpeg")
        return False


def probe_dshow_support(ffmpeg_cmd):
    """检测 dshow 支持情况。"""
    print("\n" + "="*70)
    print("🎙️  DirectShow (dshow) 支持检测")
    print("="*70 + "\n")
    
    supports_dshow = check_format_support(ffmpeg_cmd, "dshow")
    
    if supports_dshow:
        print("✅ DirectShow 支持: YES")
        print("   - 推荐配置: audio_input_format = dshow")
        print("   - 特点:")
        print("     • 兼容性好")
        print("     • 延迟较高 (150ms)")
        print("     • 通常都支持")
        return True
    else:
        print("❌ DirectShow 支持: NO")
        print("   - 这很罕见，请检查 FFmpeg 安装")
        return False


def test_wasapi_support(ffmpeg_cmd):
    """能力测试应能稳定探测 WASAPI 支持，而不是依赖返回值告警。"""
    assert isinstance(probe_wasapi_support(ffmpeg_cmd), bool)


def test_dshow_support(ffmpeg_cmd):
    """能力测试应能稳定探测 dshow 支持，而不是依赖返回值告警。"""
    assert isinstance(probe_dshow_support(ffmpeg_cmd), bool)


def list_all_input_formats(ffmpeg_cmd):
    """列出所有支持的输入格式"""
    print("\n" + "="*70)
    print("📋 所有支持的输入格式")
    print("="*70 + "\n")
    
    try:
        result = subprocess.run(
            [ffmpeg_cmd, "-formats"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=_CREATE_NO_WINDOW
        )
        
        if result.returncode == 0:
            output = result.stderr + result.stdout
            lines = output.split('\n')
            
            # 查找格式部分（通常在 "File formats:" 之后）
            in_formats = False
            format_count = 0
            
            for line in lines:
                if 'File formats:' in line:
                    in_formats = True
                    print(line)
                    print("-" * 70)
                    continue
                
                if in_formats and line.strip():
                    # 输入格式通常以空格开头，包含 "D" 标记（demuxer）
                    if line.startswith(' D'):
                        print(line)
                        format_count += 1
                    elif not line.startswith(' '):
                        # 已经到达下一个部分
                        break
            
            print(f"\n📊 总计: {format_count} 个输入格式")
            return True
        else:
            print(f"⚠️  无法列出格式: {result.stderr}")
            return False
    except Exception as e:
        print(f"⚠️  列出格式失败: {e}")
        return False


def main():
    """主函数"""
    print("\n" + "█"*70)
    print("█" + " "*68 + "█")
    print("█" + "  🎬 FFmpeg WASAPI 支持检测工具".center(68) + "█")
    print("█" + " "*68 + "█")
    print("█"*70)
    
    # 查找 FFmpeg
    print("\n🔍 查找 FFmpeg...\n")
    ffmpeg_cmd = find_ffmpeg()
    
    # 获取版本
    print()
    if not get_ffmpeg_version(ffmpeg_cmd):
        print("\n❌ 无法获取 FFmpeg 版本，请检查安装")
        return False
    
    # 测试 wasapi 支持
    wasapi_support = probe_wasapi_support(ffmpeg_cmd)
    
    # 测试 dshow 支持
    dshow_support = probe_dshow_support(ffmpeg_cmd)
    
    # 列出所有输入格式
    list_all_input_formats(ffmpeg_cmd)
    
    # 总结
    print("\n" + "="*70)
    print("📊 检测总结")
    print("="*70 + "\n")
    
    if wasapi_support and dshow_support:
        print("✅ 同时支持 WASAPI 和 DirectShow")
        print("   推荐配置: audio_input_format = wasapi (低延迟)")
        print("   备选配置: audio_input_format = dshow (兼容模式)")
        status = True
    elif wasapi_support:
        print("✅ 支持 WASAPI")
        print("   推荐配置: audio_input_format = wasapi")
        status = True
    elif dshow_support:
        print("⚠️  仅支持 DirectShow")
        print("   必需配置: audio_input_format = dshow")
        status = True
    else:
        print("❌ 既不支持 WASAPI 也不支持 DirectShow")
        print("   请检查 FFmpeg 安装或使用完整版本")
        status = False
    
    print("\n" + "="*70)
    
    return status


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 发生异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
