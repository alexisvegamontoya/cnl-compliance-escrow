@echo off
cd /d "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app"
echo.
echo ============================================
echo   CNL Compliance - Respaldo de datos
echo ============================================
echo.

:: Verificar que xlsx este instalado
node -e "require('xlsx')" 2>nul
if %errorlevel% neq 0 (
  echo Instalando dependencia xlsx...
  npm install xlsx
)

echo Iniciando respaldo...
node scripts/backup-local.js

echo.
if %errorlevel% equ 0 (
  echo Respaldo completado exitosamente.
  echo Los archivos estan en: ..\respaldos\
) else (
  echo ERROR: El respaldo fallo. Revisa el mensaje anterior.
)
echo.
pause
