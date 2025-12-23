# -*- coding: utf-8 -*-
"""
测试 MPV 启动方式的诊断脚本
"""
import os
import sys
import subprocess
import time
import shlex

# 强制 UTF-8 输出
if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

def get_app_dir():
    """获取应用目录"""
    return os.path.dirname(os.path.abspath(__file__))

def test_mpv_path():
    """测试 MPV 路径"""
    print("\n" + "="*80)
    print("📋 [第1步] 测试 MPV 路径")
    print("="*80)
    
    app_dir = get_app_dir()
    print(f"应用目录: {app_dir}")
    
    # 相对路径
    rel_path = os.path.join(app_dir, "bin", "mpv.exe")
    print(f"绝对路径: {rel_path}")
    print(f"文件存在: {os.path.exists(rel_path)}")
    
    if os.path.exists(rel_path):
        # 显示文件信息
        stat_info = os.stat(rel_path)
        print(f"文件大小: {stat_info.st_size / 1024 / 1024:.2f} MB")
        print(f"可执行: {os.access(rel_path, os.X_OK)}")
    
    return rel_path if os.path.exists(rel_path) else None

def test_mpv_version(mpv_path):
    """测试 MPV 版本"""
    print("\n" + "="*80)
    print("📋 [第2步] 测试 MPV 版本")
    print("="*80)
    
    try:
        # 使用绝对路径测试版本
        result = subprocess.run(
            [mpv_path, "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        print(f"返回码: {result.returncode}")
        if result.returncode == 0:
            print(f"✅ MPV 可以执行")
            # 显示版本信息
            version_lines = result.stdout.split('\n')[:3]
            for line in version_lines:
                print(f"  {line}")
        else:
            print(f"❌ MPV 执行失败")
            if result.stderr:
                print(f"错误: {result.stderr[:200]}")
        return True
    except Exception as e:
        print(f"❌ 执行失败: {e}")
        return False

def test_pipe_connection():
    """测试管道连接"""
    print("\n" + "="*80)
    print("📋 [第3步] 测试管道连接")
    print("="*80)
    
    pipe_name = r"\\.\pipe\mpv-pipe"
    print(f"管道名称: {pipe_name}")
    
    try:
        with open(pipe_name, "wb") as f:
            print(f"✅ 管道连接成功 (可写入)")
        return True
    except Exception as e:
        print(f"❌ 管道连接失败: {e}")
        return False

def test_startup_method1(mpv_path):
    """方法1: shell=False + 列表"""
    print("\n" + "="*80)
    print("📋 [第4步] 测试启动方式 - 方法1: shell=False + 列表")
    print("="*80)
    
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    CREATE_NO_WINDOW = 0x08000000
    
    cmd_list = [
        mpv_path,
        "--input-ipc-server=\\\\.\\pipe\\mpv-pipe",
        "--idle=yes"
    ]
    
    print(f"命令列表: {cmd_list}")
    
    try:
        process = subprocess.Popen(
            cmd_list,
            shell=False,
            creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        print(f"✅ 进程启动成功 (PID: {process.pid})")
        time.sleep(1)
        
        # 检查进程是否还在运行
        poll_result = process.poll()
        if poll_result is None:
            print(f"✅ 进程仍在运行")
            process.terminate()
            process.wait(timeout=2)
            print(f"✅ 进程已清理")
            return True
        else:
            print(f"❌ 进程已退出 (返回码: {poll_result})")
            return False
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        return False

def test_startup_method2(mpv_path):
    """方法2: shell=False + shlex.split()"""
    print("\n" + "="*80)
    print("📋 [第5步] 测试启动方式 - 方法2: shell=False + shlex.split()")
    print("="*80)
    
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    CREATE_NO_WINDOW = 0x08000000
    
    cmd_str = f'"{mpv_path}" --input-ipc-server=\\\\.\\pipe\\mpv-pipe --idle=yes'
    print(f"命令字符串: {cmd_str}")
    
    try:
        cmd_list = shlex.split(cmd_str)
        print(f"解析后列表: {cmd_list}")
        
        process = subprocess.Popen(
            cmd_list,
            shell=False,
            creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        print(f"✅ 进程启动成功 (PID: {process.pid})")
        time.sleep(1)
        
        # 检查进程是否还在运行
        poll_result = process.poll()
        if poll_result is None:
            print(f"✅ 进程仍在运行")
            process.terminate()
            process.wait(timeout=2)
            print(f"✅ 进程已清理")
            return True
        else:
            print(f"❌ 进程已退出 (返回码: {poll_result})")
            return False
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        return False

def test_startup_method3(mpv_path):
    """方法3: shell=True"""
    print("\n" + "="*80)
    print("📋 [第6步] 测试启动方式 - 方法3: shell=True")
    print("="*80)
    
    cmd_str = f'"{mpv_path}" --input-ipc-server=\\\\.\\pipe\\mpv-pipe --idle=yes'
    print(f"命令字符串: {cmd_str}")
    
    try:
        process = subprocess.Popen(cmd_str, shell=True)
        print(f"✅ 进程启动成功 (PID: {process.pid})")
        time.sleep(1)
        
        # 检查进程是否还在运行
        poll_result = process.poll()
        if poll_result is None:
            print(f"✅ 进程仍在运行")
            process.terminate()
            process.wait(timeout=2)
            print(f"✅ 进程已清理")
            return True
        else:
            print(f"❌ 进程已退出 (返回码: {poll_result})")
            return False
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        return False

def main():
    print("\n")
    print("╔" + "="*78 + "╗")
    print("║" + " "*78 + "║")
    print("║" + "  🚀 MPV 启动方式诊断工具".center(78) + "║")
    print("║" + " "*78 + "║")
    print("╚" + "="*78 + "╝")
    
    # 第1步: 检查路径
    mpv_path = test_mpv_path()
    if not mpv_path:
        print("\n❌ MPV 文件不存在，无法继续测试")
        return
    
    # 第2步: 检查版本
    if not test_mpv_version(mpv_path):
        print("\n❌ MPV 无法执行，检查文件完整性")
        return
    
    # 第3步: 检查管道（如果已经启动过则会连接成功）
    test_pipe_connection()
    
    # 第4步: 测试方法1
    method1_result = test_startup_method1(mpv_path)
    
    # 第5步: 测试方法2
    method2_result = test_startup_method2(mpv_path)
    
    # 第6步: 测试方法3
    method3_result = test_startup_method3(mpv_path)
    
    # 总结
    print("\n" + "="*80)
    print("📊 [总结]")
    print("="*80)
    print(f"方法1 (shell=False + 列表):        {'✅ 成功' if method1_result else '❌ 失败'}")
    print(f"方法2 (shell=False + shlex):       {'✅ 成功' if method2_result else '❌ 失败'}")
    print(f"方法3 (shell=True):                {'✅ 成功' if method3_result else '❌ 失败'}")
    
    print("\n💡 建议:")
    if method1_result:
        print("  使用方法1是最佳实践")
    elif method2_result:
        print("  方法1失败，推荐使用方法2")
    elif method3_result:
        print("  方法1和2都失败，使用方法3（shell=True）")
    else:
        print("  所有方法都失败，请检查：")
        print("    1. MPV 可执行文件是否完整")
        print("    2. 是否有权限执行")
        print("    3. Windows 防火墙设置")

if __name__ == "__main__":
    main()
