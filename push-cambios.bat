@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"

echo Eliminando lock de git si existe...
if exist ".git\index.lock" del /f ".git\index.lock"

echo Agregando cambios...
git add -A

echo Haciendo commit...
git commit -m "fix: parsearExcel detecta headers automaticamente; carga masiva multi-mes; ErrorBanner Informes y XMLGenerator"

echo Subiendo a GitHub...
git push

echo.
echo Listo. Vercel va a desplegar en ~1-2 minutos.
pause
