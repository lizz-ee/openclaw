@echo off
:: Keep the window open no matter what happens
if not "%~1"=="--run" (
    cmd /k "%~f0" --run
    exit /b
)

setlocal enabledelayedexpansion

:: ─── Setup ───
set "REPO_DIR=%~dp0"
set "REPO_DIR=%REPO_DIR:~0,-1%"
set "UI_DIR=%REPO_DIR%\ui"
set "GATEWAY_PORT=18789"
set "VITE_PORT=5173"

echo +======================================+
echo ^|       OPENCLAW  -  CONTROL UI       ^|
echo ^|          development mode            ^|
echo +======================================+
echo.

:: ─── Kill all existing openclaw processes ───
echo Killing stale openclaw processes...
taskkill /im openclaw.exe /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%GATEWAY_PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%VITE_PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>&1
echo [OK] Stale processes cleaned
echo.

:: ─── Ensure pnpm is available via corepack ───
where pnpm >nul 2>&1
if errorlevel 1 (
    echo Enabling pnpm via corepack...
    corepack enable pnpm 2>nul
    where pnpm >nul 2>&1
    if errorlevel 1 (
        echo [FAIL] pnpm not found. Install via: npm install -g pnpm
        exit /b 1
    )
)
set "COREPACK_ENABLE_AUTO_PIN=0"
set "COREPACK_ENABLE_STRICT=0"

:: ─── Ensure bash is available (Git for Windows) ───
where bash >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\Git\usr\bin\bash.exe" (
        set "PATH=%PATH%;C:\Program Files\Git\usr\bin"
        echo [OK] Added Git bash to PATH
    ) else (
        echo [WARN] bash not found -- gateway build may fail
    )
)

:: ─── Clean build ───
echo Cleaning old build artifacts...
if exist "%UI_DIR%\node_modules\.vite" rmdir /s /q "%UI_DIR%\node_modules\.vite" 2>nul
if exist "%REPO_DIR%\dist\control-ui" rmdir /s /q "%REPO_DIR%\dist\control-ui" 2>nul
echo [OK] Cache cleared

echo Installing dependencies...
cd /d "%REPO_DIR%"
call pnpm install --frozen-lockfile 2>nul || call pnpm install
echo [OK] Dependencies ready
echo.

:: ─── Read gateway auth token from config ───
set "OPENCLAW_CONFIG=%USERPROFILE%\.openclaw\openclaw.json"
set "GW_TOKEN="
if not exist "%OPENCLAW_CONFIG%" goto :no_token
node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.OPENCLAW_CONFIG)).gateway.auth.token)}catch{}" > "%TEMP%\oc_token.txt" 2>nul
set /p GW_TOKEN=<"%TEMP%\oc_token.txt"
del "%TEMP%\oc_token.txt" >nul 2>&1
:no_token
if defined GW_TOKEN (
    echo [OK] Gateway auth token found
) else (
    echo No gateway auth token in config -- unauthenticated mode
)

:: ─── Build gateway from dev source ───
echo Building gateway from source...
cd /d "%REPO_DIR%"
call pnpm build
echo [OK] Gateway built

:: ─── Start gateway ───
echo Starting gateway from dev build...
start /b "" node "%REPO_DIR%\dist\index.js" gateway --port %GATEWAY_PORT%
timeout /t 5 /nobreak >nul

set "GW_OK=0"
netstat -ano 2>nul | findstr ":%GATEWAY_PORT% " | findstr LISTENING >nul && set "GW_OK=1"
if "!GW_OK!"=="1" (
    echo [OK] Gateway started
) else (
    echo [FAIL] Failed to start gateway. Check build output above.
)

:: ─── Start Vite ───
echo.
echo Starting Vite dev server...
cd /d "%UI_DIR%"
start /b "" call pnpm dev

:: Wait for Vite to be ready (up to 15 seconds)
set "VITE_READY=0"
for /l %%i in (1,1,15) do (
    if "!VITE_READY!"=="0" (
        netstat -ano 2>nul | findstr ":%VITE_PORT% " | findstr LISTENING >nul && set "VITE_READY=1"
        if "!VITE_READY!"=="0" timeout /t 1 /nobreak >nul
    )
)

if "!VITE_READY!"=="1" (
    echo.
    echo [OK] Vite dev server running on http://localhost:%VITE_PORT%
    echo.
    set "OPEN_URL=http://localhost:%VITE_PORT%/?resetSettings=1"
    if defined GW_TOKEN set "OPEN_URL=!OPEN_URL!&token=!GW_TOKEN!"
    start "" "!OPEN_URL!"
) else (
    echo [FAIL] Vite failed to start
    goto :cleanup
)

:: ─── Launch TUI (foreground, interactive) ───
echo Starting OpenClaw TUI...
echo   Ctrl+C to quit TUI and shut down
echo.
node "%REPO_DIR%\openclaw.mjs" tui

:: ─── Cleanup ───
:cleanup
echo.
echo Shutting down...
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%VITE_PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%GATEWAY_PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>&1
echo Done.
endlocal
