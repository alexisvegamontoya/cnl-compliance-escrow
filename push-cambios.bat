@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: modulo gestion clientes completo — form multistep, estructura empresa recursiva, perfil con historial, acciones directas a DD/listas/calificacion"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
