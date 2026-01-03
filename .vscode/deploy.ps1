# ClubMusic Deploy Script
# For backup and deployment to remote server

$ErrorActionPreference = 'Stop'

# Configuration
$remoteDir = "\\B560\code\ClubMusic"
$exePath = "dist\ClubMusic.exe"
$backupDir = "\\B560\code\ClubMusic_backup"
$backupCreated = $false

# Get source file full path
try {
    $fullExePath = (Resolve-Path $exePath -ErrorAction Stop).Path
} catch {
    Write-Host "ERROR: dist\ClubMusic.exe not found, please run Build task first"
    exit 1
}

Write-Host "`nSource file: $fullExePath`n"

# Check if remote directory exists
if (Test-Path $remoteDir) {
    # Create backup directory if it doesn't exist
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    # Generate backup filename (original filename + timestamp)
    $backupTime = Get-Date -Format 'yyyyMMdd_HHmmss'
    $sourceFileName = Split-Path $exePath -Leaf
    $sourceBaseName = [System.IO.Path]::GetFileNameWithoutExtension($sourceFileName)
    $sourceExtension = [System.IO.Path]::GetExtension($sourceFileName)
    $backupFileName = "$sourceBaseName" + "_$backupTime" + "$sourceExtension"
    $backupFilePath = Join-Path $backupDir $backupFileName
    
    # Execute backup
    Write-Host "PACKAGE: Backing up original program..."
    
    # Backup main program
    if (Test-Path (Join-Path $remoteDir $sourceFileName)) {
        Copy-Item -Path (Join-Path $remoteDir $sourceFileName) -Destination $backupFilePath -Force
        Write-Host "OK: Backup saved: $backupFilePath"
        $backupCreated = $true
    }
    
    Write-Host "OK: Backup completed`n"
    
    # Execute deployment
    Write-Host "UPLOAD: Deploying to: $remoteDir"
    Copy-Item -Path $exePath -Destination $remoteDir -Force
    
    $targetPath = Join-Path $remoteDir $sourceFileName
    Write-Host "OK: Deployed to: $targetPath`n"
    Write-Host "SUCCESS: Deployment completed!"
} else {
    # If remote directory doesn't exist, create and deploy
    Write-Host "WARNING: Remote directory does not exist, creating and deploying`n"
    New-Item -ItemType Directory -Path $remoteDir -Force | Out-Null
    Copy-Item -Path $exePath -Destination $remoteDir -Force
    
    $targetPath = Join-Path $remoteDir (Split-Path $exePath -Leaf)
    Write-Host "OK: Deployed to: $targetPath`n"
    Write-Host "OK: Deployment completed"
}

# Summary Report
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Source File: $exePath" -ForegroundColor Green
Write-Host "Remote Dir: $remoteDir" -ForegroundColor Green
Write-Host "Backup Dir: $backupDir" -ForegroundColor Green

if ($backupCreated) {
    Write-Host "Backup File: $backupFilePath" -ForegroundColor Yellow
} else {
    Write-Host "Backup: Not created (no existing file)" -ForegroundColor Gray
}

Write-Host "Status: SUCCESS" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

exit 0
