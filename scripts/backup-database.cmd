@echo off
setlocal
cd /d "%~dp0\.."
echo ST Planning - Database Backup
node scripts\db-backup.mjs
if errorlevel 1 (
  echo.
  echo Backup FAILED.
  pause
  exit /b 1
)
echo.
echo Backup completed. Files are in the backups folder.
pause
