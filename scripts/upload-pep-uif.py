"""
Script de carga — Lista PEP UIF/ICD Costa Rica
================================================
Carga la Lista_PEP_corte_8.04.2026.xls directamente a Supabase.
No requiere pasar por el SQL Editor.

Ejecutar desde la carpeta del proyecto:
    python3 scripts/upload-pep-uif.py

Requiere: pip install xlrd requests --break-system-packages
"""

import xlrd
import json
import requests
import sys
from datetime import datetime

# ── Configuración ──────────────────────────────────────────────────────────────
SUPABASE_URL     = 'https://akczzwsfggzcfqyytyho.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY3p6d3NmZ2d6Y2ZxeXl0eWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMwNzczMCwiZXhwIjoyMDk3ODgzNzMwfQ.sIbLzj6OYKRRQGaorNMoTjaBC4ypoZyKqIq22GVimUg'

XLS_PATH  = 'Pep y padron sugef/Lista_PEP_corte_8.04.2026.xls'
BATCH     = 150   # registros por llamada API
FUENTE    = 'ICD_CR_PEP'
MOTIVO    = ('Fuente: Unidad de Información Financiera (UIF) — '
             'Instituto Costarricense sobre Drogas (ICD). '
             'Lista PEP Costa Rica, corte al 8 de abril de 2026.')

HEADERS = {
    'apikey':        SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}

# ── Helpers ────────────────────────────────────────────────────────────────────
def xl_date(val, datemode):
    if not val:
        return None
    try:
        d = xlrd.xldate_as_datetime(float(val), datemode)
        return d.strftime('%Y-%m-%d')
    except Exception:
        return None

def to_str(val):
    if isinstance(val, float):
        return str(int(val))
    return str(val or '').strip()

# ── Paso 1: Leer Excel ─────────────────────────────────────────────────────────
print(f'Leyendo {XLS_PATH}...')
wb  = xlrd.open_workbook(XLS_PATH)
sh  = wb.sheet_by_index(0)
print(f'  → {sh.nrows - 1} registros encontrados')

records = []
for i in range(1, sh.nrows):
    tipo_id = to_str(sh.cell_value(i, 0))
    ident   = to_str(sh.cell_value(i, 2))
    nombre  = to_str(sh.cell_value(i, 3))
    if not nombre:
        continue
    fnac    = xl_date(sh.cell_value(i, 5), wb.datemode)
    puesto  = to_str(sh.cell_value(i, 6))
    inst    = to_str(sh.cell_value(i, 7))
    es_vig  = to_str(sh.cell_value(i, 11))
    activo  = (es_vig == 'Sí')
    programa = f"{puesto} — {inst}".strip(' — ')

    records.append({
        'nombre_completo': nombre,
        'fuente':          FUENTE,
        'tipo_lista':      'pep',
        'tipo_entidad':    'individual',
        'fecha_nacimiento': fnac,
        'paises':          ['Costa Rica'],
        'identificaciones': [{'tipo': tipo_id, 'numero': ident}],
        'referencia_id':   ident,
        'programa':        programa,
        'motivo':          MOTIVO,
        'nivel_riesgo':    'alto',
        'activo':          activo,
    })

print(f'  → {len(records)} registros válidos procesados')

# ── Paso 2: Borrar registros anteriores ICD_CR_PEP ────────────────────────────
print('\nEliminando registros anteriores ICD_CR_PEP...')
del_res = requests.delete(
    f'{SUPABASE_URL}/rest/v1/listas_sanciones?fuente=eq.ICD_CR_PEP',
    headers=HEADERS,
    timeout=30,
)
if del_res.ok:
    print('  → Eliminados correctamente')
else:
    print(f'  ⚠ Error al eliminar: {del_res.status_code} {del_res.text[:200]}')

# ── Paso 3: Insertar en lotes ──────────────────────────────────────────────────
print(f'\nInsertando {len(records)} registros en lotes de {BATCH}...')
total_ok  = 0
total_err = 0

for i in range(0, len(records), BATCH):
    batch   = records[i:i + BATCH]
    lote_n  = i // BATCH + 1
    lotes_t = (len(records) + BATCH - 1) // BATCH

    res = requests.post(
        f'{SUPABASE_URL}/rest/v1/listas_sanciones',
        headers=HEADERS,
        data=json.dumps(batch, ensure_ascii=False, default=str),
        timeout=30,
    )

    if res.ok:
        total_ok += len(batch)
        pct = int((i + len(batch)) / len(records) * 100)
        print(f'  [{pct:3d}%] Lote {lote_n}/{lotes_t} — {len(batch)} registros OK')
    else:
        total_err += len(batch)
        print(f'  [ERR] Lote {lote_n}/{lotes_t} — {res.status_code}: {res.text[:200]}')

# ── Resumen ────────────────────────────────────────────────────────────────────
print(f'\n✅ Completado: {total_ok} registros insertados, {total_err} con error.')
if total_err == 0:
    print('   La lista PEP UIF/ICD 2026 está disponible en la aplicación.')
