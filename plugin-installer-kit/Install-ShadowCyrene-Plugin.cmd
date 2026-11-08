@echo off
setlocal
set "APP=%~1"
if not defined APP if exist "%~dp0ShadowCyrene.exe" set "APP=%~dp0ShadowCyrene.exe"
if not defined APP if exist "%~dp0..\ShadowCyrene.exe" set "APP=%~dp0..\ShadowCyrene.exe"
if not defined APP if exist "%LOCALAPPDATA%\Programs\ShadowCyrene\ShadowCyrene.exe" set "APP=%LOCALAPPDATA%\Programs\ShadowCyrene\ShadowCyrene.exe"
if not defined APP (
  echo Enter the full path to your installed ShadowCyrene.exe:
  set /p "APP=Path: "
)
set "APP=%APP:"=%"
if not exist "%APP%" (
  echo ShadowCyrene.exe not found. Install version 0.5.1 or later first.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%APP%" "%~dp0install.cjs" "%APP%"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
