@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Notebook API Provider

set "ELECTRON=node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo Chua co Electron, dang cai dat lan dau...
  echo.
  if not exist node_modules (
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :err
  )
  call node node_modules\electron\install.js
  if errorlevel 1 goto :err
)

start "" "%ELECTRON%" "%CD%"
exit /b 0

:err
echo.
echo ============================================
echo  Cai dat KHONG thanh cong.
echo  Hay chup man hinh nay va gui lai.
echo ============================================
pause
exit /b 1
