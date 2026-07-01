@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"

echo Limpiando locks...
if exist ".git\index.lock"       del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"        del /f /q ".git\HEAD.lock"
if exist ".git\MERGE_HEAD.lock"  del /f /q ".git\MERGE_HEAD.lock"
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock"

echo Haciendo commit de todos los archivos modificados...
git commit -a -m "feat: checklist DD tabla Estado+Notas+Req, CalificacionRiesgo pre-llenado completo"

echo Subiendo a GitHub/Vercel...
git push origin main

echo.
echo Listo! Vercel desplegara en ~2 minutos.
pause
