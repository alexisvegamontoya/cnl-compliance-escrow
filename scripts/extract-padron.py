"""
Script de extracción del Padrón SUGEF
======================================
Ejecutar desde la carpeta del proyecto:
  python scripts/extract-padron.py

Genera:
  scripts/data/padron_juridicas.csv
  scripts/data/padron_fisicas.csv
  scripts/data/pep_icd.csv

Fuentes (en carpeta "Pep y padron sugef"):
  - SUGEF-PadronInternoPersonasJuridicas.xml
  - SUGEF-PadronInternoPersonasFisicas.xml
  - Lista_PEP_corte_*.xls
"""

import xml.sax
import csv
import os
import glob
import xlrd
from datetime import datetime, date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(BASE, 'Pep y padron sugef')
DESTINO = os.path.join(BASE, 'scripts', 'data')
os.makedirs(DESTINO, exist_ok=True)


# ── Extractor XML base ─────────────────────────────────────────────────────────
class PadronHandler(xml.sax.ContentHandler):
    def __init__(self, writer, tipo):
        self.writer = writer
        self.tipo = tipo
        self.current_tag = ''
        self.current = {}
        self.count = 0

    def startElement(self, name, attrs):
        self.current_tag = name
        if name == 'Registro':
            self.current = {}

    def characters(self, content):
        c = content.strip()
        if not c:
            return
        # Acumular contenido (puede llegar en partes)
        self.current[self.current_tag] = self.current.get(self.current_tag, '') + c

    def endElement(self, name):
        if name != 'Registro':
            return
        self._procesar(self.current)
        self.count += 1
        if self.count % 500000 == 0:
            print(f'  Procesados: {self.count:,}')

    def _procesar(self, row):
        raise NotImplementedError


class JuridicasHandler(PadronHandler):
    def _procesar(self, row):
        ident = row.get('Identificacion', '').strip()
        nombre = row.get('RazonSocial', '').strip().upper()
        pais = row.get('PaisRegistro', '').strip()
        if ident and nombre:
            self.writer.writerow([ident, nombre, 'J', pais])


class FisicasHandler(PadronHandler):
    def _procesar(self, row):
        ident = row.get('Identificacion', '').strip()
        nombre = row.get('Nombre', '').strip()
        ap1 = row.get('PrimerApellido', '').strip()
        ap2 = row.get('SegundoApellido', '').strip()
        nombre_completo = ' '.join(filter(None, [nombre, ap1, ap2])).upper()
        pais = row.get('PaisNacimiento', '').strip()
        if ident and nombre_completo:
            self.writer.writerow([ident, nombre_completo, 'F', pais])


# ── Extraer Jurídicas ──────────────────────────────────────────────────────────
def extraer_juridicas():
    src = os.path.join(FUENTE, 'SUGEF-PadronInternoPersonasJuridicas.xml')
    dst = os.path.join(DESTINO, 'padron_juridicas.csv')
    if not os.path.exists(src):
        print(f'❌ No encontrado: {src}')
        return
    print(f'\n📂 Extrayendo Jurídicas...')
    with open(dst, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['identificacion', 'nombre_completo', 'tipo', 'pais'])
        handler = JuridicasHandler(writer, 'J')
        xml.sax.parse(src, handler)
        print(f'  ✅ Total jurídicas: {handler.count:,}')
    print(f'  Guardado: {dst}')


# ── Extraer Físicas ────────────────────────────────────────────────────────────
def extraer_fisicas():
    src = os.path.join(FUENTE, 'SUGEF-PadronInternoPersonasFisicas.xml')
    dst = os.path.join(DESTINO, 'padron_fisicas.csv')
    if not os.path.exists(src):
        print(f'❌ No encontrado: {src}')
        return
    print(f'\n📂 Extrayendo Físicas (~8M registros, puede tardar 10-15 min)...')
    with open(dst, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['identificacion', 'nombre_completo', 'tipo', 'pais'])
        handler = FisicasHandler(writer, 'F')
        xml.sax.parse(src, handler)
        print(f'  ✅ Total físicas: {handler.count:,}')
    print(f'  Guardado: {dst}')


# ── Extraer Lista PEP ICD ──────────────────────────────────────────────────────
def extraer_pep():
    archivos = glob.glob(os.path.join(FUENTE, 'Lista_PEP*.xls'))
    if not archivos:
        print(f'❌ No se encontró archivo Lista_PEP*.xls en: {FUENTE}')
        return
    src = sorted(archivos)[-1]  # El más reciente
    dst = os.path.join(DESTINO, 'pep_icd.csv')
    print(f'\n📂 Extrayendo Lista PEP: {os.path.basename(src)}')

    wb = xlrd.open_workbook(src)
    ws = wb.sheet_by_index(0)

    def excel_date(val):
        """Convierte número de serie Excel a fecha legible."""
        if not val:
            return ''
        try:
            return datetime(*xlrd.xldate_as_tuple(float(val), wb.datemode)).strftime('%Y-%m-%d')
        except Exception:
            return str(val)

    with open(dst, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['tipo_identificacion', 'identificacion', 'nombre',
                         'fecha_nacimiento', 'puesto', 'institucion',
                         'fecha_inicio', 'fecha_fin', 'fecha_fin_pep', 'es_pep_vigente'])
        count = 0
        for i in range(1, ws.nrows):
            row = [str(ws.cell_value(i, j)).strip() for j in range(ws.ncols)]
            if len(row) < 4 or not row[3]:
                continue
            writer.writerow([
                row[0],                    # tipo_identificacion
                row[2],                    # identificacion
                row[3],                    # nombre
                excel_date(row[5]) if row[5] else '',   # fecha_nacimiento
                row[6],                    # puesto
                row[7],                    # institucion
                excel_date(row[8]) if row[8] else '',   # fecha_inicio
                excel_date(row[9]) if row[9] else '',   # fecha_fin
                excel_date(row[10]) if row[10] else '', # fecha_fin_pep
                row[11],                   # es_pep_vigente
            ])
            count += 1
    print(f'  ✅ Total PEPs: {count:,}')
    print(f'  Guardado: {dst}')
    print(f'\n⚠️  RECORDATORIO: Actualizar esta lista anualmente.')
    print(f'   Próxima actualización sugerida: {datetime.now().replace(year=datetime.now().year+1).strftime("%B %Y")}')
    print(f'   Descarga: https://www.icd.go.cr (sección Estadísticas / Recursos)')


# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    arg = sys.argv[1] if len(sys.argv) > 1 else 'all'

    print('🚀 CNL Compliance — Extracción Padrón SUGEF + Lista PEP ICD')
    print('=' * 55)

    if arg in ('juridicas', 'all'):
        extraer_juridicas()
    if arg in ('fisicas', 'all'):
        extraer_fisicas()
    if arg in ('pep', 'all'):
        extraer_pep()

    print('\n✅ Extracción completada. Archivos en: scripts/data/')
    print('   Siguiente paso: node scripts/upload-padron.js')
