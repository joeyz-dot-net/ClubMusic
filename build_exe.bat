@echo off
chcp 65001 >nul
REM ========================================
REM 音乐播放器打包脚本 (FastAPI 版本)
REM ========================================

echo ========================================
echo 开始打包 FastAPI 音乐播放器...
echo ========================================
echo.

REM 检查是否安装了 PyInstaller
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [错误] 未安装 PyInstaller，正在安装...
    pip install pyinstaller
    if errorlevel 1 (
        echo [错误] 安装 PyInstaller 失败！
        pause
        exit /b 1
    )
)

echo [1/4] 清理旧的打包文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo 完成

echo.
echo [2/4] 收集依赖...
pip install -r requirements.txt
echo 完成

echo.
echo [3/4] 开始打包（这可能需要几分钟）...
python -m PyInstaller app.spec --clean --noconfirm
if errorlevel 1 (
    echo [错误] 打包失败！
    pause
    exit /b 1
)
echo 完成

echo.
echo [4/4] 复制额外文件到 dist 目录...

REM 复制 settings.ini（如果不存在则创建默认配置）
if not exist dist\MusicPlayer\settings.ini (
    copy settings.ini dist\MusicPlayer\ 2>nul
    if errorlevel 1 (
        echo [警告] settings.ini 不存在，将在首次运行时自动创建
    )
)

REM 复制 JSON 数据文件（如果存在）
if exist playback_history.json copy playback_history.json dist\MusicPlayer\ 2>nul
if exist playlist.json copy playlist.json dist\MusicPlayer\ 2>nul
if exist playlists.json copy playlists.json dist\MusicPlayer\ 2>nul

REM 复制 mpv.exe（如果存在）
if exist mpv.exe (
    copy mpv.exe dist\MusicPlayer\
    echo 已复制 mpv.exe
) else (
    echo [警告] 未找到 mpv.exe，请手动放入 dist\MusicPlayer\ 目录
)

REM 复制 yt-dlp.exe（如果存在）
if exist yt-dlp.exe (
    copy yt-dlp.exe dist\MusicPlayer\
    echo 已复制 yt-dlp.exe
) else (
    echo [警告] 未找到 yt-dlp.exe，请手动放入 dist\MusicPlayer\ 目录
)

echo 完成

echo.
echo ========================================
echo 打包完成！
echo ========================================
echo.
echo 可执行文件位置: dist\MusicPlayer\MusicPlayer.exe
echo.
echo 使用说明:
echo 1. 将整个 dist\MusicPlayer 文件夹复制到目标位置
echo 2. 确保 mpv.exe 和 yt-dlp.exe 在同一目录下
echo 3. 编辑 settings.ini 配置音乐目录
echo 4. 双击 MusicPlayer.exe 启动
echo.
echo 提示: 首次运行可能被防火墙拦截，请允许访问
echo ========================================
pause
