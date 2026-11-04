@echo off
setlocal enabledelayedexpansion
title Mihon Web Launcher
cd /d "%~dp0"

set PORT=8787
set URL=http://localhost:%PORT%

:: Check if server is already running on port 8787
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Mihon Web server is already running.
    echo Opening %URL% in your default browser...
    start "" "%URL%"
    timeout /t 2 >nul
    exit /b 0
)

echo Starting Mihon Web Server...
start "Mihon Web Server" cmd /c "python run.py & pause"

echo Waiting for Mihon Web Server to initialize...
set /a attempts=0

:check_loop
timeout /t 1 /nobreak >nul
set /a attempts+=1

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Server is ready!
    echo Opening %URL% in your default browser...
    start "" "%URL%"
    timeout /t 2 >nul
    exit /b 0
)

if %attempts% geq 25 (
    echo.
    echo Warning: Server did not respond on port %PORT% within 25 seconds.
    echo Opening browser anyway in case it started...
    start "" "%URL%"
    exit /b 1
)

goto check_loop

