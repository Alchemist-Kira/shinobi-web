@echo off
title Mihon Web Server
cd /d "%~dp0"
echo Starting Mihon Web Server on http://localhost:8787 ...
python run.py
pause
