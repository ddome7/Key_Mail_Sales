@echo off
cd /d "C:\Users\퍼즐\Desktop\LJM_Test\agents\slack-inquiry-agent"
REM -u 플래그로 stdout/stderr 언버퍼링 (monitor.log 즉시 기록 보장)
C:\Users\퍼즐\AppData\Local\Programs\Python\Python312\python.exe -X utf8 -u main.py >> monitor.log 2>&1
