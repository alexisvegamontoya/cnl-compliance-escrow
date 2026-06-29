@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: calendario de periodos reportados con declaracion sin movimiento"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
