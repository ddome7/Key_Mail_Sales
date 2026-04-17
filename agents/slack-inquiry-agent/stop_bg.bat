@echo off
REM ============================================================
REM  슬랙 문의 자동화 에이전트 — 중지
REM   agent.pid 파일에서 PID를 읽어 taskkill
REM ============================================================
cd /d "%~dp0"

if not exist "agent.pid" (
    echo [SKIP] agent.pid 파일 없음 — 실행 중 아님
    goto :eof
)

set /p AGENT_PID=<agent.pid
echo [INFO] 에이전트 PID: %AGENT_PID% 종료 시도
taskkill /F /PID %AGENT_PID%
del agent.pid 2>nul
echo [OK] 에이전트 종료 완료
