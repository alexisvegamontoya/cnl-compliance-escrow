@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"

echo Limpiando locks de git...
if exist ".git\index.lock"       del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"        del /f /q ".git\HEAD.lock"
if exist ".git\COMMIT_EDITMSG.lock" del /f /q ".git\COMMIT_EDITMSG.lock"
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock"

echo Agregando cambios...
git add -A

echo Haciendo commit...
git commit -m "feat: checklist DD tabla Estado+Notas+Req, CalificacionRiesgo pre-llenado completo"

echo Subiendo a Vercel...
git push origin main

echo.
echo Listo! Vercel desplegara en ~2 minutos.
pause
