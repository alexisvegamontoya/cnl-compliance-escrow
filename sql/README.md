# Esquema de base de datos

La base vive en Supabase. Este directorio y los `sql_*.sql` de la raíz son el
histórico de migraciones: se aplicaron a mano desde **Supabase → SQL Editor**,
en orden cronológico. No hay una herramienta de migraciones automática.

## Orden de aplicación

| # | Archivo | Crea |
|---|---------|------|
| 1 | `supabase/schema.sql` | `tenants`, `user_profiles`, `clientes`, `transacciones`, `periodos_reporte` |
| 2 | `sql_fase2.sql` | `cuestionarios`, `respuestas_cuestionario`, `audit_log` |
| 3 | `sql_expedientes_dd.sql` | `expedientes_dd` |
| 4 | `sql_modulo_pep.sql` | `listas_sanciones`, `consultas_listas`, `sync_listas_log`, `listas_metadata` |
| 5 | `sql_padron_sugef.sql` | `padron_sugef` |
| 6 | `sql_perfil_usuario.sql` | `notificaciones` |
| 7 | `sql_feed_items.sql` | `feed_items` |
| 8 | `sql/012_user_tenant_memberships.sql` | `user_tenant_memberships` |
| 9 | `sql/013_periodos_declarados.sql` | `periodos_declarados` |
| 10 | `sql/014_rls_por_membresias.sql` | *(políticas RLS por membresía)* |
| 11 | `sql/clientes_extended.sql` | `clientes_personas_relacionadas` |
| 12 | `sql/alertas_noticias.sql` | `alertas_noticias` |
| 13 | `sql/informes_periodicidad.sql` | `informes_generados` |
| 14 | `sql/add_*.sql` | columnas añadidas a tablas existentes |
| 15 | `sql/fix_*.sql` | correcciones de columnas y políticas RLS |

Los `add_*` y `fix_*` son idempotentes (`IF NOT EXISTS`) y se pueden volver a
ejecutar sin riesgo. Los `CREATE TABLE` no siempre lo son: revíselos antes de
correrlos en una base que ya tiene datos.

## Tablas sin script en el repositorio

Estas existen en producción pero **no tienen un `CREATE TABLE` versionado**. Se
crearon directamente desde el panel de Supabase:

- `calificaciones_riesgo`
- `compliance_seguimiento`
- `denuncias`
- `normativa`
- `reportes_ros`

Consecuencia práctica: **el repositorio no alcanza para reconstruir la base
desde cero.** Si hace falta levantar un ambiente nuevo, hay que exportar el
esquema desde Supabase (`Database → Schema Visualizer` o `pg_dump --schema-only`)
y guardar el resultado acá.

> `sql/014_rls_por_membresias.sql` menciona una tabla `ros_reportes` que no
> existe; la real se llama `reportes_ros`. Esa parte del script no tuvo efecto.

## Verificar la cobertura de RLS

Toda tabla con datos de clientes debe negar lecturas a un usuario anónimo. Para
comprobarlo sin exponer información, se consulta el conteo con la clave pública:

```bash
URL=$(grep -m1 '^VITE_SUPABASE_URL' .env | cut -d= -f2-)
KEY=$(grep -m1 '^VITE_SUPABASE_ANON_KEY' .env | cut -d= -f2-)

for t in clientes tenants user_profiles transacciones expedientes_dd \
         calificaciones_riesgo compliance_seguimiento denuncias normativa \
         reportes_ros informes_generados notificaciones audit_log; do
  r=$(curl -s -I "$URL/rest/v1/$t?select=*&limit=1" \
        -H "apikey: $KEY" -H "Prefer: count=exact" \
        | grep -i content-range | tr -d '\r' | sed 's/.*\///')
  printf "%-28s %s\n" "$t" "$r"
done
```

Toda fila debe dar `0`. Un número distinto significa que esa tabla quedó sin
política RLS y es legible por cualquiera que tenga la clave anónima — que va
incrustada en el JavaScript del navegador y por lo tanto es pública.

Última verificación completa: **27 de julio de 2026** — las 21 tablas que usa la
aplicación devolvieron `0`.
