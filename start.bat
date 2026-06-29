@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [같이먹자] 기존 5173 포트 정리 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [같이먹자] 잠시 후 브라우저가 자동으로 열립니다...
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:5173/"

echo [같이먹자] 개발 서버 시작 (이 창을 닫으면 서버가 종료됩니다)
npm run dev
