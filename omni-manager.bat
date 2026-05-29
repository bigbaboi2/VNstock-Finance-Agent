@echo off
chcp 65001 >nul
title OMNI DUCK — BẢNG ĐIỀU KHIỂN
color 0A

:: Khử dấu gạch chéo (\) ở cuối thư mục gốc để chống lỗi nháy kép (Escape Quote Bug)
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "FRONTEND=%ROOT_DIR%\frontend"
set "CONVERTPDF=%ROOT_DIR%\Convertpdf"
set "LOG_DIR=%ROOT_DIR%\logs"
set "PDF_LOG=%LOG_DIR%\convertpdf_log.txt"
set "SERVER_LOG=%LOG_DIR%\server_log.txt"
set "FRONTEND_LOG=%LOG_DIR%\frontend_log.txt"
set "NGROK_LOG=%LOG_DIR%\ngrok_log.txt"

:MENU
cls
echo(
echo   █████╗ ███╗   ███╗███╗   ██╗██╗    ██████╗ ██╗   ██╗ ██████╗██╗  ██╗
echo  ██╔══██╗████╗ ████║████╗  ██║██║    ██╔══██╗██║   ██║██╔════╝██║ ██╔╝
echo  ██║  ██║██╔████╔██║██╔██╗ ██║██║    ██║  ██║██║   ██║██║     █████╔╝
echo  ██║  ██║██║╚██╔╝██║██║╚██╗██║██║    ██║  ██║██║   ██║██║     ██╔═██╗
echo   █████╔╝██║ ╚═╝ ██║██║ ╚████║██║    ██████╔╝╚██████╔╝╚██████╗██║  ██╗
echo    ════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝    ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝
echo(
echo ================================================================
echo               HỆ THỐNG QUẢN LÝ OMNI DUCK
echo ================================================================
echo(
echo  [1] TRÌNH QUẢN LÝ DỊCH VỤ (Kiểm soát Ẩn/Hiện/Tắt từng File)
echo  [2] Dọn dẹp TOÀN BỘ hệ thống (Tắt mọi tiến trình ngầm)
echo(
echo  [8] MỞ BẢNG THEO DÕI (Live CPU/RAM ^& Log tất cả dịch vụ)
echo(
echo  [0] Thoát Bảng Điều Khiển
echo(
echo ================================================================
set /p choice=" Nhập lựa chọn (0, 1, 2, 8): "

if "%choice%"=="1" goto START_WIZARD
if "%choice%"=="2" goto STOP_ALL
if "%choice%"=="8" goto MONITOR
if "%choice%"=="0" exit
goto MENU

:START_WIZARD
cls
echo(
echo ================================================================
echo           TRÌNH QUẢN LÝ KHỞI ĐỘNG OMNI DUCK
echo ================================================================
echo Nhập phím tương ứng cho từng dịch vụ dưới đây:
echo   [A] Chạy ẨN ngầm dưới nền
echo   [H] Chạy HIỆN cửa sổ Terminal
echo   [X] TẮT hoàn toàn dịch vụ này (Giải phóng RAM/Port)
echo   [Enter] BỎ QUA (Giữ nguyên trạng thái hiện tại)
echo ----------------------------------------------------------------
echo(

set opt_pdf=B
set /p opt_pdf="1. ConvertPDF (Port 8000) [A / H / X / Enter]: "

set opt_back=B
set /p opt_back="2. Backend Node.js (Port 3001) [A / H / X / Enter]: "

set opt_front=B
set /p opt_front="3. Frontend Vite (Port 5173) [A / H / X / Enter]: "

set opt_ngrok=B
set /p opt_ngrok="4. Ngrok Tunnel (Port 3001) [A / H / X / Enter]: "

echo(
echo Đang thực thi các yêu cầu...

call :PROCESS_PDF "%opt_pdf%"
call :PROCESS_BACK "%opt_back%"
call :PROCESS_FRONT "%opt_front%"
call :PROCESS_NGROK "%opt_ngrok%"

echo(
echo [THÀNH CÔNG] Đã thiết lập xong các tiến trình bạn chọn!
echo ----------------------------------------------------------------
echo [0] Nhấn số 0 để THOÁT bảng điều khiển
echo [Enter] Nhấn Enter để quay lại MENU
set /p post_action=" Lựa chọn của bạn: "
if "%post_action%"=="0" exit
goto MENU


:: ==========================================
:: CÁC KHỐI XỬ LÝ ĐỘC LẬP (CHỐNG LỖI CRASH)
:: ==========================================

:PROCESS_PDF
if /I "%~1"=="X" goto PDF_X
if /I "%~1"=="H" goto PDF_H
if /I "%~1"=="A" goto PDF_A
exit /b
:PDF_X
call :KILL_PORT 8000
echo  -^> Da DONG hoan toan ConvertPDF.
exit /b
:PDF_H
call :KILL_PORT 8000
call :ENSURE_LOG_DIR
if exist "%PDF_LOG%" del /q "%PDF_LOG%"
start "OMNI - ConvertPDF" powershell -NoExit -NoProfile -Command "$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; $env:PYTHONIOENCODING='utf-8'; $env:PYTHONUTF8='1'; Set-Location -LiteralPath '%CONVERTPDF%'; python -X utf8 Convertpdf.py 2>&1 | ForEach-Object { $line=[string]$_; [Console]::WriteLine($line); [System.IO.File]::AppendAllText('%PDF_LOG%', $line + [Environment]::NewLine, $utf8) }"
echo  -^> Khoi dong HIEN ConvertPDF.
exit /b
:PDF_A
call :KILL_PORT 8000
call :ENSURE_LOG_DIR
if exist "%PDF_LOG%" del /q "%PDF_LOG%"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; $env:PYTHONIOENCODING=''utf-8''; $env:PYTHONUTF8=''1''; Set-Location -LiteralPath ''%CONVERTPDF%''; python -X utf8 Convertpdf.py 2>&1 | ForEach-Object { $line=[string]$_; [System.IO.File]::AppendAllText(''%PDF_LOG%'', $line + [Environment]::NewLine, $utf8) }'"
echo  -^> Khoi dong AN ConvertPDF.
exit /b

:PROCESS_BACK
if /I "%~1"=="X" goto BACK_X
if /I "%~1"=="H" goto BACK_H
if /I "%~1"=="A" goto BACK_A
exit /b
:BACK_X
call :KILL_PORT 3001
echo  -^> Da DONG hoan toan Backend.
exit /b
:BACK_H
call :KILL_PORT 3001
call :ENSURE_LOG_DIR
if exist "%SERVER_LOG%" del /q "%SERVER_LOG%"
start "OMNI - Backend" powershell -NoExit -NoProfile -Command "$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; Set-Location -LiteralPath '%ROOT_DIR%'; node src/server.js 2>&1 | ForEach-Object { $line=[string]$_; [Console]::WriteLine($line); [System.IO.File]::AppendAllText('%SERVER_LOG%', $line + [Environment]::NewLine, $utf8) }"
echo  -^> Khoi dong HIEN Backend.
exit /b
:BACK_A
call :KILL_PORT 3001
call :ENSURE_LOG_DIR
if exist "%SERVER_LOG%" del /q "%SERVER_LOG%"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; Set-Location -LiteralPath ''%ROOT_DIR%''; node src/server.js 2>&1 | ForEach-Object { $line=[string]$_; [System.IO.File]::AppendAllText(''%SERVER_LOG%'', $line + [Environment]::NewLine, $utf8) }'"
echo  -^> Khoi dong AN Backend.
exit /b

:PROCESS_FRONT
if /I "%~1"=="X" goto FRONT_X
if /I "%~1"=="H" goto FRONT_H
if /I "%~1"=="A" goto FRONT_A
exit /b
:FRONT_X
call :KILL_PORT 5173
echo  -^> Da DONG hoan toan Frontend.
exit /b
:FRONT_H
call :KILL_PORT 5173
call :ENSURE_LOG_DIR
if exist "%FRONTEND_LOG%" del /q "%FRONTEND_LOG%"
start "OMNI - Frontend" powershell -NoExit -NoProfile -Command "$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; Set-Location -LiteralPath '%FRONTEND%'; npm run dev 2>&1 | ForEach-Object { $line=[string]$_; [Console]::WriteLine($line); [System.IO.File]::AppendAllText('%FRONTEND_LOG%', $line + [Environment]::NewLine, $utf8) }"
echo  -^> Khoi dong HIEN Frontend.
exit /b
:FRONT_A
call :KILL_PORT 5173
call :ENSURE_LOG_DIR
if exist "%FRONTEND_LOG%" del /q "%FRONTEND_LOG%"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','$utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; Set-Location -LiteralPath ''%FRONTEND%''; npm run dev 2>&1 | ForEach-Object { $line=[string]$_; [System.IO.File]::AppendAllText(''%FRONTEND_LOG%'', $line + [Environment]::NewLine, $utf8) }'"
echo  -^> Khoi dong AN Frontend.
exit /b

:PROCESS_NGROK
if /I "%~1"=="X" goto NGROK_X
if /I "%~1"=="H" goto NGROK_H
if /I "%~1"=="A" goto NGROK_A
exit /b
:NGROK_X
taskkill /IM ngrok.exe /F >nul 2>&1
echo  -^> Da DONG hoan toan Ngrok.
exit /b
:NGROK_H
taskkill /IM ngrok.exe /F >nul 2>&1
call :ENSURE_LOG_DIR
if exist "%NGROK_LOG%" del /q "%NGROK_LOG%"
start "OMNI - Ngrok" cmd /k "cd /d "%ROOT_DIR%" && npx ngrok http 3001 --url=finalize-rasping-decency.ngrok-free.dev --log=%NGROK_LOG%"
echo  -^> Khoi dong HIEN Ngrok.
exit /b
:NGROK_A
taskkill /IM ngrok.exe /F >nul 2>&1
call :ENSURE_LOG_DIR
if exist "%NGROK_LOG%" del /q "%NGROK_LOG%"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -WorkingDirectory '%ROOT_DIR%' -FilePath 'cmd' -ArgumentList '/c','npx ngrok http 3001 --url=finalize-rasping-decency.ngrok-free.dev --log=%NGROK_LOG%'"
echo  -^> Khoi dong AN Ngrok.
exit /b

:: ==========================================
:: HÀM ĐẢM BẢO THƯ MỤC LOG TỒN TẠI
:: ==========================================
:ENSURE_LOG_DIR
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
exit /b

:: ==========================================
:: HÀM TIÊU DIỆT TIẾN TRÌNH THEO CỔNG MẠNG
:: ==========================================
:KILL_PORT
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%1 "') do taskkill /PID %%a /F >nul 2>&1
exit /b

:: ==========================================
:: DỌN DẸP HỆ THỐNG VÀ RADAR THEO DÕI
:: ==========================================
:STOP_ALL
echo(
echo Đang tìm và diệt tất cả tiến trình chạy ngầm...
taskkill /IM ngrok.exe /F >nul 2>&1
call :KILL_PORT 8000
call :KILL_PORT 3001
call :KILL_PORT 5173
echo [XONG] Đã dọn dẹp sạch sẽ toàn bộ tiến trình.
echo Nhấn phím bất kỳ để về Menu...
pause >nul
goto MENU

:MONITOR
cls
echo Dang nap modun Giao dien Radar (UI)...
set "PS_SCRIPT=%ROOT_DIR%\omni-radar.ps1"
if exist "%PS_SCRIPT%" del /q "%PS_SCRIPT%"

echo $logsConfig = @( >> "%PS_SCRIPT%"
echo     @{ Name = 'CONVERTPDF'; Path = '%PDF_LOG%' }, >> "%PS_SCRIPT%"
echo     @{ Name = 'BACKEND SERVER'; Path = '%SERVER_LOG%' }, >> "%PS_SCRIPT%"
echo     @{ Name = 'FRONTEND VITE'; Path = '%FRONTEND_LOG%' }, >> "%PS_SCRIPT%"
echo     @{ Name = 'NGROK TUNNEL'; Path = '%NGROK_LOG%' } >> "%PS_SCRIPT%"
echo ) >> "%PS_SCRIPT%"
echo $utf8 = New-Object System.Text.UTF8Encoding $false >> "%PS_SCRIPT%"
echo [Console]::InputEncoding = $utf8 >> "%PS_SCRIPT%"
echo [Console]::OutputEncoding = $utf8 >> "%PS_SCRIPT%"
echo $OutputEncoding = $utf8 >> "%PS_SCRIPT%"
echo $counter = 10 >> "%PS_SCRIPT%"
echo $cpu=0; $tot=0; $used=0; $pct=0 >> "%PS_SCRIPT%"
echo function Write-LogPanel($name, $path, $tail) { >> "%PS_SCRIPT%"
echo     Write-Host ('[LOG {0} ({1} DONG MOI NHAT)]' -f $name, $tail) -ForegroundColor Magenta >> "%PS_SCRIPT%"
echo     if (Test-Path $path) { >> "%PS_SCRIPT%"
echo         $logs = @(Get-Content $path -Tail $tail -Encoding UTF8 -ErrorAction SilentlyContinue) >> "%PS_SCRIPT%"
echo         for ($i=0; $i -lt $tail; $i++) { >> "%PS_SCRIPT%"
echo             if ($i -lt $logs.Count) { >> "%PS_SCRIPT%"
echo                 $line = [string]$logs[$i] -replace '[\x00]', '' >> "%PS_SCRIPT%"
echo                 if ($line.Length -gt 110) { $line = $line.Substring(0, 110) } >> "%PS_SCRIPT%"
echo                 Write-Host ('  ' + $line.PadRight(110)) -ForegroundColor White >> "%PS_SCRIPT%"
echo             } else { >> "%PS_SCRIPT%"
echo                 Write-Host (''.PadRight(112)) >> "%PS_SCRIPT%"
echo             } >> "%PS_SCRIPT%"
echo         } >> "%PS_SCRIPT%"
echo     } else { >> "%PS_SCRIPT%"
echo         Write-Host ('  [!] Chua co du lieu log: ' + $path).PadRight(112) -ForegroundColor Red >> "%PS_SCRIPT%"
echo         for ($i=1; $i -lt $tail; $i++) { Write-Host (''.PadRight(112)) } >> "%PS_SCRIPT%"
echo     } >> "%PS_SCRIPT%"
echo     Write-Host '' >> "%PS_SCRIPT%"
echo } >> "%PS_SCRIPT%"
echo Clear-Host >> "%PS_SCRIPT%"
echo while ($true) { >> "%PS_SCRIPT%"
echo     if ($counter -ge 10) { >> "%PS_SCRIPT%"
echo         $cpuObj = Get-WmiObject Win32_Processor ^| Measure-Object -Property LoadPercentage -Average >> "%PS_SCRIPT%"
echo         $cpu = if ($cpuObj.Average) { $cpuObj.Average } else { 0 } >> "%PS_SCRIPT%"
echo         $mem = Get-CimInstance Win32_OperatingSystem >> "%PS_SCRIPT%"
echo         $tot = [math]::Round($mem.TotalVisibleMemorySize/1048576, 2) >> "%PS_SCRIPT%"
echo         $free = [math]::Round($mem.FreePhysicalMemory/1048576, 2) >> "%PS_SCRIPT%"
echo         $used = $tot - $free >> "%PS_SCRIPT%"
echo         $pct = [math]::Round(($used/$tot)*100, 1) >> "%PS_SCRIPT%"
echo         $counter = 0 >> "%PS_SCRIPT%"
echo     } >> "%PS_SCRIPT%"
echo     $counter++ >> "%PS_SCRIPT%"
echo     Clear-Host >> "%PS_SCRIPT%"
echo     Write-Host '================================================================' -ForegroundColor Cyan >> "%PS_SCRIPT%"
echo     Write-Host '      OMNI DUCK - RADAR THEO DOI HE THONG LIVE                  ' -ForegroundColor Yellow >> "%PS_SCRIPT%"
echo     Write-Host '================================================================' -ForegroundColor Cyan >> "%PS_SCRIPT%"
echo     Write-Host '' >> "%PS_SCRIPT%"
echo     Write-Host '[THONG SO PHAN CUNG] (Lam moi CPU/RAM sau 5s)' -ForegroundColor Magenta >> "%PS_SCRIPT%"
echo     Write-Host ('  CPU Dang tai : {0}%%    ' -f $cpu) -ForegroundColor Green >> "%PS_SCRIPT%"
echo     Write-Host ('  RAM Su dung  : {0} GB / {1} GB ({2}%%)    ' -f $used, $tot, $pct) -ForegroundColor Green >> "%PS_SCRIPT%"
echo     Write-Host '' >> "%PS_SCRIPT%"
echo     foreach ($log in $logsConfig) { Write-LogPanel $log.Name $log.Path 5 } >> "%PS_SCRIPT%"
echo     Write-Host '================================================================' -ForegroundColor Cyan >> "%PS_SCRIPT%"
echo     Write-Host ' [ BAM PHIM BAT KY DE THOAT RADAR VA VE MENU ]' -ForegroundColor DarkGray >> "%PS_SCRIPT%"
echo     if ([console]::KeyAvailable) { >> "%PS_SCRIPT%"
echo         $null = [console]::ReadKey($true) >> "%PS_SCRIPT%"
echo         break >> "%PS_SCRIPT%"
echo     } >> "%PS_SCRIPT%"
echo     Start-Sleep -Milliseconds 500 >> "%PS_SCRIPT%"
echo } >> "%PS_SCRIPT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
del /q "%PS_SCRIPT%"
goto MENU
