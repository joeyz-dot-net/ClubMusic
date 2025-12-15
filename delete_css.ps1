# CSS 文件安全删除脚本 (PowerShell)
# 用于删除分离后的旧 CSS 文件

$cssDir = "static/css"
$styleFile = "$cssDir/style.css"
$backupFile = "$cssDir/style.css.backup"

function Show-Header {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    CSS 文件删除工具" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Check-Files {
    Write-Host "检查文件..."
    
    if (Test-Path $styleFile) {
        Write-Host "[✓] 找到 $styleFile" -ForegroundColor Green
        $styleStat = Get-Item $styleFile
        Write-Host "   大小: $($styleStat.Length) 字节"
    } else {
        Write-Host "[⚠] 找不到 $styleFile" -ForegroundColor Yellow
    }
    
    if (Test-Path $backupFile) {
        Write-Host "[✓] 找到 $backupFile" -ForegroundColor Green
        $backupStat = Get-Item $backupFile
        Write-Host "   大小: $($backupStat.Length) 字节"
    } else {
        Write-Host "[⚠] 找不到 $backupFile" -ForegroundColor Yellow
    }
    Write-Host ""
}

function Show-Files {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    可删除的文件" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "1. style.css (原始 CSS 文件)"
    Write-Host "2. style.css.backup (备份文件)"
    Write-Host ""
    
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    必需保留的文件" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "✓ base.css" -ForegroundColor Green
    Write-Host "✓ theme-dark.css" -ForegroundColor Green
    Write-Host "✓ theme-light.css" -ForegroundColor Green
    Write-Host "✓ responsive.css" -ForegroundColor Green
    Write-Host ""
}

function Show-Menu {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    选择操作" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "1. 删除 style.css.backup (备份文件)"
    Write-Host "2. 删除 style.css (原始文件)"
    Write-Host "3. 同时删除两个文件"
    Write-Host "4. 显示 CSS 文件列表"
    Write-Host "5. 取消操作"
    Write-Host ""
    
    $choice = Read-Host "请选择 (1-5)"
    return $choice
}

function Delete-BackupFile {
    if (Test-Path $backupFile) {
        Write-Host ""
        Write-Host "正在删除 $backupFile..." -ForegroundColor Yellow
        Remove-Item $backupFile -Force
        Write-Host "[✓] 成功删除备份文件" -ForegroundColor Green
    } else {
        Write-Host "[⚠] 文件不存在" -ForegroundColor Yellow
    }
}

function Delete-StyleFile {
    if (Test-Path $styleFile) {
        Write-Host ""
        Write-Host "[警告] 这将删除原始 CSS 文件！" -ForegroundColor Red
        Write-Host "确保已在浏览器中测试过新的 CSS 文件。" -ForegroundColor Yellow
        Write-Host ""
        
        $confirm = Read-Host "确定要删除吗? (Y/N)"
        if ($confirm -eq "Y" -or $confirm -eq "y") {
            Write-Host "正在删除 $styleFile..." -ForegroundColor Yellow
            Remove-Item $styleFile -Force
            Write-Host "[✓] 成功删除 style.css" -ForegroundColor Green
        } else {
            Write-Host "[已取消] 未删除文件" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[⚠] 文件不存在" -ForegroundColor Yellow
    }
}

function Delete-BothFiles {
    Write-Host ""
    Write-Host "[警告] 这将删除备份文件和原始文件！" -ForegroundColor Red
    Write-Host "确保已在浏览器中测试过新的 CSS 文件。" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "确定要删除这两个文件吗? (Y/N)"
    if ($confirm -eq "Y" -or $confirm -eq "y") {
        if (Test-Path $backupFile) {
            Write-Host "正在删除 $backupFile..." -ForegroundColor Yellow
            Remove-Item $backupFile -Force
            Write-Host "[✓] 已删除 style.css.backup" -ForegroundColor Green
        }
        if (Test-Path $styleFile) {
            Write-Host "正在删除 $styleFile..." -ForegroundColor Yellow
            Remove-Item $styleFile -Force
            Write-Host "[✓] 已删除 style.css" -ForegroundColor Green
        }
        Write-Host "[✓] 删除完成" -ForegroundColor Green
    } else {
        Write-Host "[已取消] 未删除文件" -ForegroundColor Yellow
    }
}

function Show-CurrentFiles {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    当前 CSS 文件列表" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    Get-ChildItem $cssDir -Filter "*.css" | ForEach-Object {
        $size = $_.Length
        Write-Host "$($_.Name)" -ForegroundColor Cyan -NoNewline
        Write-Host " - $size 字节"
    }
    Write-Host ""
}

# 主程序
do {
    Show-Header
    Check-Files
    Show-Files
    
    $choice = Show-Menu
    
    switch ($choice) {
        "1" { Delete-BackupFile }
        "2" { Delete-StyleFile }
        "3" { Delete-BothFiles }
        "4" { Show-CurrentFiles }
        "5" { 
            Write-Host ""
            Write-Host "[已取消] 无操作" -ForegroundColor Yellow
            exit
        }
        default { 
            Write-Host ""
            Write-Host "[错误] 无效选择，请重试" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Read-Host "按 Enter 继续"
    Clear-Host
} while ($true)
