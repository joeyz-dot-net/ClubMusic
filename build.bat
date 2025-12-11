@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo 激活虚拟环境...
call .\.venv\Scripts\activate.bat

echo 开始打包...
pyinstaller app.spec --noconfirm --clean

echo 打包完成！
echo 输出文件位置: dist\app.exe
pause
