@echo off
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)
if not exist .env (
  copy .env.example .env
  echo.
  echo .env created. Put your Telegram bot token into telegram-bot\.env and run this file again.
  pause
  exit /b 0
)
.venv\Scripts\python.exe bot.py
pause
