@echo off
chcp 65001 >nul
cd /d %~dp0
echo CopiRyt zapuskaetsya...
python main.py
pause
