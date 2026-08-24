-- Datos de contacto para las personas relacionadas (representante legal, etc.):
-- dirección, teléfono y correo. Se capturan en el editor de estructura del cliente
-- jurídico (src/components/clientes/EstructuraEmpresa.jsx) y se guardan aquí.
alter table public.clientes_personas_relacionadas
  add column if not exists direccion text,
  add column if not exists telefono  text,
  add column if not exists correo    text;
