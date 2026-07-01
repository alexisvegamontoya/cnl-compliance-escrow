@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: reorganizar sidebar — listas/DD/calificacion pasan a seccion Clientes; se mantienen como modulos independientes"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
