@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
if exist ".git\index.lock" del /f ".git\index.lock"
git add -A
git commit -m "feat: informes anuales, alertas clientes en noticias, CCSS/SUGEF en PEP, quitar nivel riesgo DD"
git push
echo.
echo Listo. Vercel deployara en ~1-2 minutos.
pause
