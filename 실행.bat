@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 이상을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
pushd "%~dp0퀴즈경주"
if not exist node_modules (
  call npm ci --no-fund
  if errorlevel 1 goto prepare_error
)
call npm run build
if errorlevel 1 goto prepare_error
popd
node hub-server.mjs
goto end
:prepare_error
popd
echo 퀴즈 경주 실행 준비에 실패했습니다. 위 오류를 확인하세요.
:end
pause
