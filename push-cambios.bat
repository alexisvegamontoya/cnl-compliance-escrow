@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"

echo Pausando OneDrive temporalmente...
taskkill /f /im OneDrive.exe >nul 2>&1
timeout /t 2 >nul

echo Limpiando locks...
if exist ".git\index.lock"       del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"        del /f /q ".git\HEAD.lock"
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock"

echo Agregando y committeando cambios...
git add -A
git commit -m "feat: checklist DD tabla Estado+Notas+Req, CalificacionRiesgo pre-llenado"

echo Subiendo a GitHub/Vercel...
git push origin main

echo Reiniciando OneDrive...
start "" "%LOCALAPPDATA%\Microsoft\OneDrive\OneDrive.exe"

echo.
echo Listo! Vercel desplegara en ~2 minutos.
pause
