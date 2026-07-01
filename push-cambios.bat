@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: expediente cliente — calificacion riesgo, listas PEP todos los participantes, checklist DD imprimible"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
