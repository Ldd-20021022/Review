@echo off
chcp 65001 >nul
echo ========================================
echo  EMR Assessment System - Starting...
echo ========================================

echo.
echo [0/3] Stopping old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 "') do taskkill /F /PID %%a 2>nul
echo   Done.

echo.
echo [1/3] Initialize database (seed data)...
cd /d %~dp0backend
set PYTHONIOENCODING=utf-8
python seed.py >nul 2>&1
echo   Done.

echo.
echo [2/3] Backend on port 8000...
start "EMR-Backend" /min cmd /c "cd /d %~dp0backend && set PYTHONIOENCODING=utf-8 && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo [3/3] Frontend on port 5173...
start "EMR-Frontend" /min cmd /c "cd /d %~dp0frontend && python -m http.server 5173 --bind 0.0.0.0"

echo.
echo Waiting for startup...
timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo   Test accounts:
echo     Director:  director / 123456
echo     DeptHead:  dept1 ~ dept6 / 123456
echo     Admin:     admin / admin123
echo.
echo Close the two minimized windows to stop servers.
pause
