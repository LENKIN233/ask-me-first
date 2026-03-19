@echo off
:: ============================================================
:: ask_me_first Gateway Patch Injector
:: 自动将 ask-me-first-patch.js 注入到 OpenClaw Gateway bundle
:: ============================================================
setlocal enabledelayedexpansion

set "OPENCLAW_DIR=%APPDATA%\npm\node_modules\openclaw"
set "PATCH_FILE=%~dp0ask-me-first-patch.js"
set "ANCHOR=handleAbortTrigger"

echo [ask_me_first] Gateway Patch Injector
echo ======================================

:: Step 1: Locate bundle
echo [1/5] 定位 Gateway bundle...
if not exist "%OPENCLAW_DIR%\dist" (
  echo 错误：找不到 %OPENCLAW_DIR%\dist
  exit /b 1
)

:: Find the reply-*.js bundle file
set "TARGET="
for %%f in ("%OPENCLAW_DIR%\dist\reply-*.js") do (
  set "TARGET=%%f"
)
if "%TARGET%"=="" (
  echo 错误：找不到 reply-*.js bundle 文件
  exit /b 1
)
echo 找到 bundle: %TARGET%

:: Step 2: Check if already patched
echo [2/5] 检查是否已注入...
powershell -NoProfile -Command "if (Select-String -Path '%TARGET%' -Pattern 'ask_me_first: slash command access control' -Quiet) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo 补丁已存在，跳过注入。如需重新注入请先运行 restore.bat
  echo 提示：也可以删除 .backup 文件后手动恢复
  exit /b 0
)

:: Step 3: Backup
echo [3/5] 备份原文件...
if not exist "%TARGET%.backup" (
  copy "%TARGET%" "%TARGET%.backup" >nul
  if errorlevel 1 (
    echo 错误：备份失败
    exit /b 1
  )
  echo 已备份到 %TARGET%.backup
) else (
  echo 备份已存在，跳过
)

:: Step 4: Extract patch content (between markers)
echo [4/5] 注入补丁...

:: Use PowerShell to:
:: 1. Read patch file, extract between BEGIN/END markers
:: 2. Find injection point in bundle (after handleAbortTrigger array closing)
:: 3. Insert patch content
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$patchFile = '%PATCH_FILE%';" ^
  "$bundleFile = '%TARGET%';" ^
  "" ^
  "# Read patch content between markers" ^
  "$patchLines = Get-Content $patchFile -Encoding UTF8;" ^
  "$inBlock = $false;" ^
  "$patchContent = @();" ^
  "foreach ($line in $patchLines) {" ^
  "  if ($line -match 'BEGIN PATCH BLOCK') { $inBlock = $true; continue }" ^
  "  if ($line -match 'END PATCH BLOCK') { $inBlock = $false; continue }" ^
  "  if ($inBlock) { $patchContent += $line }" ^
  "}" ^
  "if ($patchContent.Count -eq 0) {" ^
  "  Write-Error 'Failed to extract patch content from markers';" ^
  "  exit 1" ^
  "}" ^
  "Write-Host \"  提取了 $($patchContent.Count) 行补丁代码\";" ^
  "" ^
  "# Read bundle" ^
  "$bundle = [System.IO.File]::ReadAllText($bundleFile, [System.Text.Encoding]::UTF8);" ^
  "" ^
  "# Find injection point: after handleAbortTrigger array" ^
  "# The pattern: '];' that closes the handleAbortTrigger array, then inject before resetMatch" ^
  "$anchorPattern = 'handleAbortTrigger';" ^
  "$anchorIdx = $bundle.IndexOf($anchorPattern);" ^
  "if ($anchorIdx -lt 0) {" ^
  "  Write-Error \"Cannot find anchor '$anchorPattern' in bundle\";" ^
  "  exit 1" ^
  "}" ^
  "" ^
  "# Find the next '];' after handleAbortTrigger (end of the array)" ^
  "$searchFrom = $anchorIdx;" ^
  "$closeBracket = $bundle.IndexOf('];', $searchFrom);" ^
  "if ($closeBracket -lt 0) {" ^
  "  Write-Error 'Cannot find closing bracket after anchor';" ^
  "  exit 1" ^
  "}" ^
  "$insertAt = $closeBracket + 2;" ^
  "" ^
  "# Build the injection string" ^
  "$nl = [Environment]::NewLine;" ^
  "$patchStr = $nl + ($patchContent -join $nl) + $nl;" ^
  "" ^
  "# Inject" ^
  "$newBundle = $bundle.Insert($insertAt, $patchStr);" ^
  "[System.IO.File]::WriteAllText($bundleFile, $newBundle, [System.Text.Encoding]::UTF8);" ^
  "Write-Host '  补丁注入成功';"

if %errorlevel% neq 0 (
  echo 错误：补丁注入失败
  echo 正在恢复备份...
  copy "%TARGET%.backup" "%TARGET%" >nul
  exit /b 1
)

:: Step 5: Restart gateway
echo [5/5] 重启 Gateway...
where openclaw >nul 2>&1
if %errorlevel%==0 (
  :: Clean stale lock files first
  if exist "%TEMP%\openclaw" (
    del /q "%TEMP%\openclaw\gateway.*.lock" 2>nul
  )
  openclaw gateway stop 2>nul
  timeout /t 2 /nobreak >nul
  start "" /b openclaw gateway start
  echo Gateway 已重启
) else (
  echo 未找到 openclaw 命令，请手动重启 Gateway
)

echo.
echo ======================================
echo [ask_me_first] 补丁注入完成！
echo   bundle: %TARGET%
echo   backup: %TARGET%.backup
echo ======================================
