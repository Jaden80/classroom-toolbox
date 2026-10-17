@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 이상을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --no-fund
  if errorlevel 1 goto error
)
if not exist dist\index.html (
  call npm run build
  if errorlevel 1 goto error
)
echo.
echo 브라우저에서 http://localhost:4317 을 여세요.
echo 서버 종료: Ctrl+C
call npm start
goto end
:error
echo 실행 준비에 실패했습니다. 위 오류를 확인하세요.
:end
pause
