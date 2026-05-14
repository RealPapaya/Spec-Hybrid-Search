@echo off
chcp 65001 >nul
setlocal

set "DIR=%~dp0"

:: ── Detect Python ─────────────────────────────────────────────────────────────
set "PY="
if exist "%DIR%.venv\Scripts\python.exe" set "PY=%DIR%.venv\Scripts\python.exe"
if "%PY%"=="" (
    where python >nul 2>&1
    if not errorlevel 1 set "PY=python"
)
if "%PY%"=="" (
    echo.
    echo  [ERROR] Python not found.
    echo  Please install Python 3.10+ or set up a venv:
    echo.
    echo    python -m venv .venv
    echo    .venv\Scripts\activate
    echo    pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

:MENU
cls
echo.
echo  +---------------------------------------+
echo  ^|  DocSense - Local Document Search     ^|
echo  +---------------------------------------+
echo.
echo    Python : %PY%
echo    Dir    : %DIR%
echo.
echo    1.  Start server
echo    2.  Restart server
echo    3.  Install / update dependencies
echo    0.  Exit
echo.
set "C="
set /p "C=  Choose [0-3]: "

if "%C%"=="1" goto :START
if "%C%"=="2" goto :RESTART
if "%C%"=="3" goto :INSTALL
if "%C%"=="0" goto :EXIT
echo.
echo  Please enter 0, 1, 2, or 3.
timeout /t 1 >nul
goto :MENU

:: ── 1. Start ──────────────────────────────────────────────────────────────────
:START
netstat -ano 2>nul | findstr ":8000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo  [WARN] Port 8000 already in use.
    echo         Use option 2 to restart.
    echo.
    pause
    goto :MENU
)
echo.
echo  Launching DocSense in a new window...
start "DocSense" cmd /k ""%PY%" "%DIR%start.py""
echo  Done. Browser will open automatically.
echo.
pause
goto :MENU

:: ── 2. Restart ────────────────────────────────────────────────────────────────
:RESTART
echo.
echo  Killing existing processes on ports 8000 and 6333...
call :KILL_PORTS
timeout /t 2 >nul
echo  Starting DocSense...
start "DocSense" cmd /k ""%PY%" "%DIR%start.py""
echo  Done. Browser will open automatically.
echo.
pause
goto :MENU

:: ── 3. Install ────────────────────────────────────────────────────────────────
:INSTALL
echo.
echo  Running: pip install -r requirements.txt
echo.
"%PY%" -m pip install -r "%DIR%requirements.txt"
echo.
echo  Installation complete.
pause
goto :MENU

:: ── 0. Exit ───────────────────────────────────────────────────────────────────
:EXIT
echo.
set "S=y"
set /p "S=  Also stop the running server? [Y/n]: "
if /i not "%S%"=="n" (
    call :KILL_PORTS
    echo  Server stopped.
)
echo  Goodbye.
exit /b 0

:: ── Helper: kill port 8000 + 6333 ────────────────────────────────────────────
:KILL_PORTS
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "LISTENING"') do (
    if not "%%a"=="" taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":6333" ^| findstr "LISTENING"') do (
    if not "%%a"=="" taskkill /PID %%a /F >nul 2>&1
)
exit /b
