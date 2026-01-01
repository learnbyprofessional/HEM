@echo off
title Home Expense Manager V1.1
color 0A
echo ============================================
echo   Home Expense Manager V1.1
echo   Starting application...
echo ============================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    echo This may take a minute on first run...
    echo.
    npm install
    echo.
)

REM Start the Node.js server
start /B node server.js

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Open default browser
echo Opening browser...
start http://localhost:3000

echo.
echo ============================================
echo   Application is running!
echo   Access at: http://localhost:3000
echo
echo   Press any key to stop the server
echo ============================================
echo.

REM Keep the window open
pause

REM Kill node process when window closes
taskkill /F /IM node.exe >nul 2>&1
