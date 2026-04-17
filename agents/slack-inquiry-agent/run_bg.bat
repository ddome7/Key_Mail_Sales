@echo off
REM ============================================================
REM  슬랙 문의 자동화 에이전트 — Windows 백그라운드 실행
REM   - wscript가 보이지 않는 쉘을 띄우고 run.bat을 실행
REM   - 콘솔 창 없이 monitor.log에 모든 출력이 쌓임
REM   - main.py의 singleton lock이 중복 실행 방지
REM ============================================================
cd /d "%~dp0"

REM VBS 런처 생성 (최초 1회)
if not exist "_bg_launcher.vbs" (
    echo Set WshShell = CreateObject("WScript.Shell") > "_bg_launcher.vbs"
    echo WshShell.Run """%~dp0run.bat""", 0, False >> "_bg_launcher.vbs"
)

wscript.exe "%~dp0_bg_launcher.vbs"
echo [OK] 백그라운드 실행 시작됨. 로그: monitor.log
