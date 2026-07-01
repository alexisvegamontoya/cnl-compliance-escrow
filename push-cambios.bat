@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: modulo gestion clientes — form multistep, estructura empresa, perfil, carga masiva Excel con plantilla descargable"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
