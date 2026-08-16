-- ============================================================
-- Resync de secuencias (preventivo tras la migración a 3 proyectos)
-- Reinicia TODAS las secuencias serial/identity al máximo id existente.
-- Es SEGURO e idempotente: solo evita errores "duplicate key" en próximos INSERT.
-- Correr en el SQL Editor de cada proyecto (Cumplimiento y Evaluador).
-- Si el proyecto usa un esquema propio además de public, agregarlo al IN(...).
-- ============================================================
DO $$
DECLARE r record; maxid bigint;
BEGIN
  FOR r IN
    SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS tabla,
           a.attname AS col,
           pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(c.relname), a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public')
      AND pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(c.relname), a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT max(%I) FROM %s', r.col, r.tabla) INTO maxid;
    IF maxid IS NOT NULL THEN
      PERFORM setval(r.seq, maxid, true);
    END IF;
  END LOOP;
END $$;
