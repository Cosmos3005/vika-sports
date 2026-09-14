@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (start "Vika Sports" cmd /k py server.py) else (start "Vika Sports" cmd /k python server.py)
timeout /t 2 >nul
start http://127.0.0.1:8080
