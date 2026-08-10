@echo off
:: Se sitúa en la raíz del proyecto a partir de la ubicación de este archivo.
:: Antes tenía la ruta escrita a mano y apuntaba a OneDrive; al mudarse el
:: proyecto a C:\Proyectos el respaldo dejó de correr sin que nadie lo notara.
cd /d "%~dp0.."
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
