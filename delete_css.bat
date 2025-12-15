@echo off
REM CSS 文件安全删除脚本
REM 用于删除分离后的旧 CSS 文件

setlocal enabledelayedexpansion

echo ============================================
echo    CSS 文件删除工具
echo ============================================
echo.

set CSS_DIR=static\css

REM 检查文件是否存在
if not exist "%CSS_DIR%\style.css" (
    echo [警告] 找不到 %CSS_DIR%\style.css
) else (
    echo [✓] 找到 %CSS_DIR%\style.css
)

if not exist "%CSS_DIR%\style.css.backup" (
    echo [警告] 找不到 %CSS_DIR%\style.css.backup
) else (
    echo [✓] 找到 %CSS_DIR%\style.css.backup
)

echo.
echo ============================================
echo    可删除的文件
echo ============================================
echo 1. %CSS_DIR%\style.css (原始 CSS 文件)
echo 2. %CSS_DIR%\style.css.backup (备份文件)
echo.

echo ============================================
echo    必需保留的文件
echo ============================================
echo ✓ %CSS_DIR%\base.css
echo ✓ %CSS_DIR%\theme-dark.css
echo ✓ %CSS_DIR%\theme-light.css
echo ✓ %CSS_DIR%\responsive.css
echo.

:menu
echo ============================================
echo    选择操作
echo ============================================
echo 1. 删除 style.css.backup (备份文件)
echo 2. 删除 style.css (原始文件)
echo 3. 同时删除两个文件
echo 4. 取消操作
echo.

set /p choice="请选择 (1-4): "

if "%choice%"=="1" goto delete_backup
if "%choice%"=="2" goto delete_style
if "%choice%"=="3" goto delete_both
if "%choice%"=="4" goto cancel
echo [错误] 无效选择，请重试
echo.
goto menu

:delete_backup
echo.
echo 正在删除 %CSS_DIR%\style.css.backup...
if exist "%CSS_DIR%\style.css.backup" (
    del "%CSS_DIR%\style.css.backup"
    echo [✓] 成功删除备份文件
) else (
    echo [错误] 文件不存在
)
goto end

:delete_style
echo.
echo [警告] 这将删除原始 CSS 文件！
echo 确保已在浏览器中测试过新的 CSS 文件。
set /p confirm="确定要删除吗？(Y/N): "
if /i "%confirm%"=="Y" (
    if exist "%CSS_DIR%\style.css" (
        del "%CSS_DIR%\style.css"
        echo [✓] 成功删除 style.css
    ) else (
        echo [错误] 文件不存在
    )
) else (
    echo [已取消] 未删除文件
)
goto end

:delete_both
echo.
echo [警告] 这将删除备份文件和原始文件！
echo 确保已在浏览器中测试过新的 CSS 文件。
set /p confirm="确定要删除这两个文件吗？(Y/N): "
if /i "%confirm%"=="Y" (
    if exist "%CSS_DIR%\style.css.backup" (
        del "%CSS_DIR%\style.css.backup"
        echo [✓] 已删除 style.css.backup
    )
    if exist "%CSS_DIR%\style.css" (
        del "%CSS_DIR%\style.css"
        echo [✓] 已删除 style.css
    )
    echo [✓] 删除完成
) else (
    echo [已取消] 未删除文件
)
goto end

:cancel
echo.
echo [已取消] 无操作
goto end

:end
echo.
echo ============================================
echo    当前 CSS 文件列表
echo ============================================
echo.
dir "%CSS_DIR%\*.css"
echo.
echo ============================================
pause
