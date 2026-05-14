@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: DocSense Launcher
:: Compatible: Windows 7 / 8.1 / 10 / 11  (32-bit and 64-bit)

set "DIR=%~dp0"
set "VENV_DIR=%DIR%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"
set "PROGRAMFILES_X86=%ProgramFiles(x86)%"
set "PY="

:: =============================================================================
:: STEP 1 -- Find a working Python interpreter (5-level fallback chain)
:: =============================================================================

:: Level 1: existing .venv (fast path for returning users)
if exist "%VENV_PY%" (
    set "PY=%VENV_PY%"
    goto :CHECK_VERSION
)

:: Level 2: py launcher -- ships with every official Python 3.3+ installer on
::          Windows; resolves to the highest installed 3.x automatically.
where py >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do (
        set "PY=%%i"
        goto :CHECK_VERSION
    )
)

:: Level 3: 'python' in PATH, but skip Windows Store stub aliases.
::          Store stubs live in %LocalAppData%\Microsoft\WindowsApps\ and
::          open the Store instead of running Python.
set "_FOUND=0"
for /f "delims=" %%i in ('where python 2^>nul') do (
    if "!_FOUND!"=="0" (
        echo "%%i" | findstr /i "WindowsApps" >nul
        if errorlevel 1 (
            "%%i" -c "import sys" >nul 2>&1
            if not errorlevel 1 (
                set "PY=%%i"
                set "_FOUND=1"
            )
        )
    )
)
if "!_FOUND!"=="1" goto :CHECK_VERSION

:: Level 4: 'python3' in PATH (Git Bash installs, some custom setups)
for /f "delims=" %%i in ('where python3 2^>nul') do (
    if "!_FOUND!"=="0" (
        "%%i" -c "import sys" >nul 2>&1
        if not errorlevel 1 (
            set "PY=%%i"
            set "_FOUND=1"
        )
    )
)
if "!_FOUND!"=="1" goto :CHECK_VERSION

:: Level 5: Scan standard installation directories for Python 3.10 - 3.13
::          Checks per-user (%LOCALAPPDATA%) and system-wide Program Files.
for %%v in (313 312 311 310) do (
    if exist "%LOCALAPPDATA%\Programs\Python\Python%%v\python.exe" (
        set "PY=%LOCALAPPDATA%\Programs\Python\Python%%v\python.exe"
        goto :CHECK_VERSION
    )
    if exist "%ProgramFiles%\Python%%v\python.exe" (
        set "PY=%ProgramFiles%\Python%%v\python.exe"
        goto :CHECK_VERSION
    )
    if defined PROGRAMFILES_X86 (
        if exist "!PROGRAMFILES_X86!\Python%%v\python.exe" (
            set "PY=!PROGRAMFILES_X86!\Python%%v\python.exe"
            goto :CHECK_VERSION
        )
    )
)

goto :NO_PYTHON

:: =============================================================================
:: STEP 2 -- Verify Python version is 3.10 or newer
:: =============================================================================
:CHECK_VERSION
"%PY%" -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
if errorlevel 1 (
    for /f "delims=" %%v in ('"%PY%" --version 2^>^&1') do set "_VER=%%v"
    echo.
    echo  [ERROR] Python 3.10 or newer is required.
    echo  Found  : !_VER!
    echo  Path   : %PY%
    echo.
    echo  Download the latest Python from:
    echo    https://www.python.org/downloads/
    echo.
    echo  During installation check:
    echo    [v] Add Python to PATH
    echo    [v] Install for all users  ^(recommended^)
    echo.
    pause
    exit /b 1
)

:: =============================================================================
:: STEP 3 -- First-run: create venv + install packages when needed
:: =============================================================================
set "_NEED_SETUP=0"
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    set "_NEED_SETUP=1"
) else (
    "%VENV_PY%" -c "import fastapi" >nul 2>&1
    if errorlevel 1 set "_NEED_SETUP=1"
)

if "!_NEED_SETUP!"=="1" (
    call :FIRST_RUN_SETUP
    if errorlevel 1 (
        echo.
        echo  Setup failed -- check the messages above.
        pause
        exit /b 1
    )
)

:: Switch to venv Python for all subsequent operations
if exist "%VENV_PY%" set "PY=%VENV_PY%"

:: =============================================================================
:: MAIN MENU
:: =============================================================================
:MENU
cls
call :PRINT_BANNER

for /f "tokens=2" %%v in ('"%PY%" --version 2^>^&1') do set "_PYVER=%%v"

set "_STATUS=Stopped"
netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
if not errorlevel 1 set "_STATUS=Running  (http://localhost:8000)"

echo    Python  : %_PYVER%
echo    Server  : %_STATUS%
echo    Docs    : %DIR%watched_docs\
echo.
call :SELECT_MENU

if "!_C!"=="1" goto :START
if "!_C!"=="2" goto :RESTART
if "!_C!"=="3" goto :INSTALL
if "!_C!"=="4" goto :OPEN_DOCS
if "!_C!"=="0" goto :EXIT
goto :MENU

:: =============================================================================
:: SUBROUTINE: Arrow-key menu selector
:: =============================================================================
:SELECT_MENU
set "_C="
set "_MENU_RESULT=%TEMP%\docsense_menu_%RANDOM%%RANDOM%.tmp"
if exist "%_MENU_RESULT%" del "%_MENU_RESULT%" >nul 2>&1
if exist "%DIR%docsense_menu.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%docsense_menu.ps1" "%_MENU_RESULT%"
) else (
    call :SELECT_MENU_FALLBACK
)
if not defined _C if not exist "%_MENU_RESULT%" (
    call :SELECT_MENU_FALLBACK
)
if exist "%_MENU_RESULT%" (
    set /p "_C="<"%_MENU_RESULT%"
    del "%_MENU_RESULT%" >nul 2>&1
)
if not defined _C set "_C=0"
exit /b 0

:SELECT_MENU_FALLBACK
    echo.
    echo    [1] Start server
    echo    [2] Restart server
    echo    [3] Install / update packages
    echo    [4] Open watched_docs folder
    echo    [0] Exit
    echo.
    set /p "_C=   Select: "
exit /b 0

:: =============================================================================
:: SUBROUTINE: Print TUI banner
:: =============================================================================
:PRINT_BANNER
if exist "%DIR%docsense_banner.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%docsense_banner.ps1"
    if not errorlevel 1 exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand JABvAGwAZAA9AFsAQwBvAG4AcwBvAGwAZQBdADoAOgBGAG8AcgBlAGcAcgBvAHUAbgBkAEMAbwBsAG8AcgAKAHQAcgB5ACAAewAKACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARgBvAHIAZQBnAHIAbwB1AG4AZABDAG8AbABvAHIAPQAnAEIAbAB1AGUAJwAKACAAIABmAG8AcgBlAGEAYwBoACAAKAAkAGwAaQBuAGUAIABpAG4AIABAACgACgAgACAAIAAgACcAJwAsAAoAIAAgACAAIAAnACAAiCWIJYgliCWIJYglVyUgACAAiCWIJYgliCWIJYglVyUgACAAiCWIJYgliCWIJYglVyWIJYgliCWIJYgliCWIJVcliCWIJYgliCWIJYgliCVXJYgliCWIJVclIAAgACAAiCWIJVcliCWIJYgliCWIJYgliCVXJYgliCWIJYgliCWIJYglVyUnACwACgAgACAAIAAgACcAIACIJYglVCVQJVAliCWIJVcliCWIJVQlUCVQJVAliCWIJVcliCWIJVQlUCVQJVAlUCVdJYgliCVUJVAlUCVQJVAlXSWIJYglVCVQJVAlUCVQJV0liCWIJYgliCVXJSAAIACIJYglUSWIJYglVCVQJVAlUCVQJV0liCWIJVQlUCVQJVAlUCVdJScALAAKACAAIAAgACAAJwAgAIgliCVRJSAAIACIJYglUSWIJYglUSUgACAAIACIJYglUSWIJYglUSUgACAAIAAgACAAiCWIJYgliCWIJYgliCVXJYgliCWIJYgliCVXJSAAIACIJYglVCWIJYglVyUgAIgliCVRJYgliCWIJYgliCWIJYglVyWIJYgliCWIJYglVyUgACAAJwAsAAoAIAAgACAAIAAnACAAiCWIJVElIAAgAIgliCVRJYgliCVRJSAAIAAgAIgliCVRJYgliCVRJSAAIAAgACAAIABaJVAlUCVQJVAliCWIJVEliCWIJVQlUCVQJV0lIAAgAIgliCVRJVoliCWIJVcliCWIJVElWiVQJVAlUCVQJYgliCVRJYgliCVUJVAlUCVdJSAAIAAnACwACgAgACAAIAAgACcAIACIJYgliCWIJYgliCVUJV0lWiWIJYgliCWIJYgliCVUJV0lWiWIJYgliCWIJYgliCVXJYgliCWIJYgliCWIJYglUSWIJYgliCWIJYgliCWIJVcliCWIJVElIABaJYgliCWIJYglUSWIJYgliCWIJYgliCWIJVEliCWIJYgliCWIJYgliCVXJScALAAKACAAIAAgACAAJwAgAFolUCVQJVAlUCVQJV0lIAAgAFolUCVQJVAlUCVQJV0lIAAgAFolUCVQJVAlUCVQJV0lWiVQJVAlUCVQJVAlUCVdJVolUCVQJVAlUCVQJVAlXSVaJVAlXSUgACAAWiVQJVAlUCVdJVolUCVQJVAlUCVQJVAlXSVaJVAlUCVQJVAlUCVQJV0lJwAKACAAIAApACkAIAB7ACAAWwBDAG8AbgBzAG8AbABlAF0AOgA6AFcAcgBpAHQAZQBMAGkAbgBlACgAJABsAGkAbgBlACkAIAB9AAoAIAAgAFsAQwBvAG4AcwBvAGwAZQBdADoAOgBGAG8AcgBlAGcAcgBvAHUAbgBkAEMAbwBsAG8AcgA9ACcARABhAHIAawBHAHIAYQB5ACcACgAgACAAWwBDAG8AbgBzAG8AbABlAF0AOgA6AFcAcgBpAHQAZQBMAGkAbgBlACgAJwAgACAAIABVAG4AaQB2AGUAcgBzAGEAbAAgAEQAbwBjAHUAbQBlAG4AdAAgAFMAZQBhAHIAYwBoACAAIAB2ADEALgAwACAAIAB8ACAAIABoAHQAdABwADoALwAvAGwAbwBjAGEAbABoAG8AcwB0ADoAOAAwADAAMAAnACkACgAgACAAWwBDAG8AbgBzAG8AbABlAF0AOgA6AFcAcgBpAHQAZQBMAGkAbgBlACgAJwAnACkACgB9ACAAZgBpAG4AYQBsAGwAeQAgAHsACgAgACAAWwBDAG8AbgBzAG8AbABlAF0AOgA6AEYAbwByAGUAZwByAG8AdQBuAGQAQwBvAGwAbwByAD0AJABvAGwAZAAKAH0A
if not errorlevel 1 exit /b 0
echo.
echo    DOCSENSE
echo.
echo    Universal Document Search  v1.0  ^|  http://localhost:8000
echo.
exit /b 0

:: =============================================================================
:: [1] Start
:: =============================================================================
:START
netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo   Server is already running at http://localhost:8000
    start "" "http://localhost:8000"
    echo.
    timeout /t 1 >nul
    goto :MENU
)
echo.
echo   Starting DocSense...
call :START_BACKGROUND
if errorlevel 1 (
    echo   Failed to start DocSense.
    echo   Log  -- %DIR%logs\docsense.err.log
    echo.
    pause
    goto :MENU
)
call :WAIT_FOR_SERVER
if errorlevel 1 (
    echo   DocSense is starting in the background.
    echo   Open http://localhost:8000 after a moment.
    echo   Log  -- %DIR%logs\docsense.log
    echo.
    pause
    goto :MENU
)
echo   Opening http://localhost:8000 ...
start "" "http://localhost:8000"
echo.
timeout /t 1 >nul
goto :MENU

:: =============================================================================
:: [2] Restart
:: =============================================================================
:RESTART
echo.
echo   Stopping services on ports 8000 and 6333...
call :KILL_PORTS
echo   Waiting for ports to release...
call :WAIT_FOR_PORTS_FREE
echo   Starting DocSense...
call :START_BACKGROUND
if errorlevel 1 (
    echo   Failed to start DocSense.
    echo   Log  -- %DIR%logs\docsense.err.log
    echo.
    pause
    goto :MENU
)
call :WAIT_FOR_SERVER
if errorlevel 1 (
    echo   DocSense is starting in the background.
    echo   Open http://localhost:8000 after a moment.
    echo   Log  -- %DIR%logs\docsense.log
    echo.
    pause
    goto :MENU
)
echo   Opening http://localhost:8000 ...
start "" "http://localhost:8000"
echo.
timeout /t 1 >nul
goto :MENU

:: =============================================================================
:: SUBROUTINE: Start DocSense without opening another terminal window
:: =============================================================================
:START_BACKGROUND
if not exist "%DIR%logs\" mkdir "%DIR%logs"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%DIR%docsense_start_hidden.ps1" -PythonPath "%PY%" -ScriptPath "%DIR%start.py" -WorkDir "%DIR%." -LogPath "%DIR%logs\docsense.log"
exit /b %errorlevel%

:: =============================================================================
:: SUBROUTINE: Wait until ports 8000 and 6333 are fully released
:: =============================================================================
:WAIT_FOR_PORTS_FREE
for /l %%i in (1,1,20) do (
    netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
    if not errorlevel 1 (
        timeout /t 1 >nul
    ) else (
        netstat -ano 2>nul | findstr ":6333 " | findstr "LISTENING" >nul
        if not errorlevel 1 (
            timeout /t 1 >nul
        ) else (
            exit /b 0
        )
    )
)
exit /b 0

:: =============================================================================
:: SUBROUTINE: Wait until the API port is ready
:: =============================================================================
:WAIT_FOR_SERVER
for /l %%i in (1,1,30) do (
    netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
    if not errorlevel 1 exit /b 0
    timeout /t 1 >nul
)
exit /b 1

:: =============================================================================
:: [3] Install / update packages
:: =============================================================================
:INSTALL
echo.
echo   Updating packages from requirements.txt...
echo.
if exist "%VENV_PIP%" (
    "%VENV_PY%" -m pip install --upgrade pip >nul 2>&1
    "%VENV_PY%" -m pip install -r "%DIR%requirements.txt"
) else (
    "%PY%" -m pip install --upgrade pip >nul 2>&1
    "%PY%" -m pip install -r "%DIR%requirements.txt"
)
echo.
echo   Done.
pause
goto :MENU

:: =============================================================================
:: [4] Open watched_docs folder
:: =============================================================================
:OPEN_DOCS
if not exist "%DIR%watched_docs\" mkdir "%DIR%watched_docs"
explorer "%DIR%watched_docs"
goto :MENU

:: =============================================================================
:: [0] Exit
:: =============================================================================
:EXIT
echo.
netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
    set "_STOP=y"
    set /p "_STOP=   Stop the running server? [Y/n]: "
    if /i not "!_STOP!"=="n" (
        call :KILL_PORTS
        echo   Server stopped.
    )
)
echo.
echo   Goodbye.
exit /b 0

:: =============================================================================
:: SUBROUTINE: First-run setup
:: Creates .venv and installs all packages from requirements.txt
:: =============================================================================
:FIRST_RUN_SETUP
cls
call :PRINT_BANNER
echo.
echo    First-Run Setup
echo.
echo   Python : %PY%
echo.
echo   This will:
echo     1. Create a virtual environment in .venv\
echo     2. Install required packages  (~500 MB first time)
echo.
echo   An internet connection is required for step 2.
echo.
set "_OK=y"
set /p "_OK=   Proceed? [Y/n]: "
if /i "!_OK!"=="n" (
    echo   Cancelled.
    exit /b 1
)

echo.
echo   [1/2] Creating virtual environment...
"%PY%" -m venv "%VENV_DIR%"
if errorlevel 1 (
    echo.
    echo   [ERROR] Failed to create virtual environment.
    echo   Ensure the 'venv' module is included with your Python install.
    exit /b 1
)

echo   [2/2] Installing packages (this may take a few minutes)...
echo.
"%VENV_PY%" -m pip install --upgrade pip >nul 2>&1
"%VENV_PY%" -m pip install -r "%DIR%requirements.txt"
if errorlevel 1 (
    echo.
    echo   [ERROR] Package installation failed.
    echo   Check your internet connection, then choose [3] to retry.
    exit /b 1
)

echo.
echo   Setup complete!
timeout /t 2 >nul
exit /b 0

:: =============================================================================
:: SUBROUTINE: Kill processes listening on ports 8000 and 6333
:: Method 1: netstat + taskkill  (all Windows versions)
:: Method 2: PowerShell fallback  (Windows 8+ / PS 4+, handles edge cases)
:: =============================================================================
:KILL_PORTS
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" taskkill /PID %%a /F /T >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":6333 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" taskkill /PID %%a /F /T >nul 2>&1
)
powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort 8000,6333 -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }" >nul 2>&1
exit /b 0

:: =============================================================================
:: Python not found anywhere -- show helpful instructions
:: =============================================================================
:NO_PYTHON
echo.
echo  +--------------------------------------------------+
echo  ^|  Python Not Found                               ^|
echo  +--------------------------------------------------+
echo.
echo   DocSense requires Python 3.10 or newer.
echo.
echo   Download the latest Python:
echo     https://www.python.org/downloads/
echo.
echo   During installation, make sure to check:
echo     [v] Add Python to PATH
echo     [v] Install for all users  (recommended)
echo.
echo   After installing Python, run this launcher again.
echo.
pause
exit /b 1
