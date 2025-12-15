@echo off
chcp 65001 >nul
REM ========================================
REM 快速启动 - 跳过检查直接运行
REM ========================================

echo 正在启动开发服务器...
echo 访问: http://localhost:80
echo.

python main.py

pause
