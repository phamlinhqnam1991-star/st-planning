@echo off
setlocal
cd /d "%~dp0\.."
echo ST Planning - Database Restore
if "%~1"=="" (
  echo Drag a .dump file onto this CMD, or run:
  echo scripts\restore-database.cmd backups\st-planning_YYYYMMDD_HHMMSS.dump
  pause
  exit /b 1
)
echo.
echo WARNING: restore will replace objects/data in public schema.
set /p CONFIRM=Type RESTORE to continue: 
if /I not "%CONFIRM%"=="RESTORE" (
  echo Cancelled.
  exit /b 1
)
node scripts\db-restore.mjs "%~1" --confirm=RESTORE
pause
